// ============================================================
// Authentication Service
// Implements JWT access + refresh token rotation (Bearer + httpOnly cookie)
// Security: short-lived access tokens, refresh token rotation, bcrypt(12)
// ============================================================

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../config';
import { env, REFRESH_TOKEN_TTL_MS, SESSION_REFRESH_TOKEN_TTL_MS } from '../config/env';
import { getSortParams } from '../utils/sorting';
import { JwtPayload } from '../types';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
  AppError,
  ForbiddenError,
} from '../utils/errors';
import { RegisterInput, CreateUserInput } from '../validators';
import { notificationService } from './notification.service';
import { recordActivity } from './activity-log.service';
import { isDepartmentCode } from '../constants/departments';

const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const PASSWORD_RESET_CODE_EXPIRY_MINUTES = 10;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_DELIVERY_TIMEOUT_MS = 2 * 60 * 1000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function createPasswordResetEmail(firstName: string, code: string) {
  const greeting = firstName ? `Hello ${escapeHtml(firstName)},` : 'Hello,';
  const text = `${firstName ? `Hello ${firstName},` : 'Hello,'}

Your Cordova Public College Library one-time password is:

${code}

This code expires in ${PASSWORD_RESET_CODE_EXPIRY_MINUTES} minutes.
If you did not request this, ignore this email.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#374151;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;">
            <tr>
              <td align="center" style="padding:32px;">
                <img src="https://cpc-library.online/CPClogo.png" width="64" height="64" alt="Cordova Public College" style="display:block;width:64px;height:64px;margin:0 auto 24px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#111827;">${greeting}</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">Your Cordova Public College Library one-time password is:</p>
                <p style="margin:0 0 16px;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:#111827;text-align:center;">${code}</p>
                <p style="margin:0 0 8px;font-size:14px;line-height:20px;color:#6b7280;">This code expires in ${PASSWORD_RESET_CODE_EXPIRY_MINUTES} minutes.</p>
                <p style="margin:0;font-size:14px;line-height:20px;color:#6b7280;">If you did not request this, ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

function getUserUniqueConflict(error: unknown): ConflictError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }

  const target = error.meta?.target;
  const fields = (Array.isArray(target) ? target.join(' ') : String(target ?? '')).toLowerCase();
  if (fields.includes('email')) {
    return new ConflictError('An account with this email already exists');
  }
  if (fields.includes('libraryid') || fields.includes('library_id')) {
    return new ConflictError('An account with this ID Number already exists');
  }
  return new ConflictError('An account with these details already exists');
}

export class AuthService {
  async requestPasswordReset(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { libraryId: normalized }], isActive: true },
    });
    if (!user) throw new NotFoundError('User account');

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
    const firstName = user.firstName?.trim() ?? '';
    const { text, html } = createPasswordResetEmail(firstName, code);

    const resetToken = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "users" WHERE id = ${user.id} FOR UPDATE
      `;

      const previousToken = await tx.passwordResetToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      const now = new Date();
      if (previousToken?.sentAt) {
        if (now.getTime() < previousToken.sentAt.getTime() + PASSWORD_RESET_RESEND_COOLDOWN_MS) {
          throw new BadRequestError('Please wait before requesting another code.');
        }
      } else if (previousToken) {
        if (now.getTime() < previousToken.createdAt.getTime() + PASSWORD_RESET_DELIVERY_TIMEOUT_MS) {
          throw new BadRequestError('Please wait before requesting another code.');
        }
        await tx.passwordResetToken.delete({ where: { id: previousToken.id } });
      }

      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: now,
          createdAt: now,
        },
      });
    }, { maxWait: 10_000, timeout: 10_000 });

    try {
      await notificationService.sendEmail({
        to: user.email,
        userId: user.id,
        fromName: 'Cordova Public College Library',
        subject: 'Your One-Time Password (OTP)',
        body: text,
        html,
      });
    } catch (error) {
      await prisma.passwordResetToken.deleteMany({
        where: { id: resetToken.id, sentAt: null },
      });
      throw error;
    }

    const sentAt = new Date();
    const expiresAt = new Date(sentAt.getTime() + PASSWORD_RESET_CODE_EXPIRY_MINUTES * 60 * 1000);
    const resendAvailableAt = new Date(sentAt.getTime() + PASSWORD_RESET_RESEND_COOLDOWN_MS);
    const markedSent = await prisma.passwordResetToken.updateMany({
      where: { id: resetToken.id, sentAt: null },
      data: { sentAt, createdAt: sentAt, expiresAt },
    });
    if (markedSent.count !== 1) {
      console.error('Password reset email was sent but its reset record could not be marked as sent.');
      throw new AppError('We could not complete the password reset request. Request a new code.', 503);
    }

    return {
      message: 'A verification code has been sent to your registered email.',
      email: user.email,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
    };
  }

  async verifyPasswordReset(identifier: string, code: string) {
    const user = await prisma.user.findFirst({ where: { email: identifier.trim().toLowerCase(), isActive: true } });
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const resetToken = user ? await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, sentAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    }) : null;
    if (!resetToken) throw new BadRequestError('Invalid or expired verification code.');
    const codeExpiresAt = new Date(Math.min(
      resetToken.expiresAt.getTime(),
      resetToken.createdAt.getTime() + PASSWORD_RESET_CODE_EXPIRY_MINUTES * 60 * 1000,
    ));
    if (codeExpiresAt <= new Date()) {
      throw new BadRequestError('That code has expired. Request a new one.');
    }
    if (resetToken.tokenHash !== codeHash) throw new BadRequestError('Invalid or expired verification code.');
    const resetTokenValue = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { tokenHash: crypto.createHash('sha256').update(resetTokenValue).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
    return { resetToken: resetTokenValue };
  }

  async resetPassword(rawToken: string, newPassword: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new BadRequestError('This password reset link is invalid or expired.');
    }

    const password = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: resetToken.userId }, data: { password } });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.logActivity(
        resetToken.userId,
        'RESET_PASSWORD',
        'User',
        resetToken.userId,
        ipAddress,
        userAgent ? { userAgent } : undefined,
        tx,
      );
    });
    return { message: 'Password reset successfully.' };
  }
  // ────────────────────────────────────────
  //  PUBLIC: LOGIN
  // ────────────────────────────────────────
  async login(identifier: string, password: string, rememberMe = true, ipAddress?: string, userAgent?: string) {
    const normalized = (identifier || '').trim().toLowerCase();
    let user;
    try {
      user = await prisma.user.findFirst({
        where: {
          OR: [{ email: normalized }, { libraryId: normalized }],
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('notifications_enabled')) {
        throw new AppError(
          'The database schema is out of date. Apply the pending Prisma migrations and restart the backend.',
          503
        );
      }
      throw error;
    }
    if (!user) {
      await recordActivity({
        actorName: 'Unknown user',
        action: 'FAILED_LOGIN',
        description: 'Failed login attempt',
        entity: 'Authentication',
        ipAddress,
        details: { loginIdentifier: normalized, status: 'Failed', ...(userAgent ? { userAgent } : {}) },
      });
      throw new UnauthorizedError('Invalid ID Number or password');
    }
    if (!user.isActive) {
      await recordActivity({
        userId: user.id,
        action: 'FAILED_LOGIN',
        description: 'Failed login attempt for deactivated account',
        entity: 'Authentication',
        entityId: user.id,
        ipAddress,
        details: { loginIdentifier: normalized, reason: 'Account deactivated', status: 'Failed', ...(userAgent ? { userAgent } : {}) },
      });
      throw new UnauthorizedError(
        'Your account has been deactivated. Please contact the library.'
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      await recordActivity({
        userId: user.id,
        action: 'FAILED_LOGIN',
        description: 'Failed login attempt',
        entity: 'Authentication',
        entityId: user.id,
        ipAddress,
        details: { loginIdentifier: normalized, status: 'Failed', ...(userAgent ? { userAgent } : {}) },
      });
      throw new UnauthorizedError('Invalid ID Number or password');
    }

    const loginRecorded = await prisma.user.updateMany({
      where: { id: user.id, isActive: true, archivedAt: null },
      data: { lastLoginAt: new Date() },
    });
    if (loginRecorded.count !== 1) {
      throw new UnauthorizedError('Your account has been archived. Please contact the library.');
    }

    // Generate token pair
    const accessToken = this.generateAccessToken(user.id, user.libraryId, user.role);
    const refreshToken = await this.generateRefreshToken(
      user.id,
      rememberMe ? REFRESH_TOKEN_TTL_MS : SESSION_REFRESH_TOKEN_TTL_MS,
    );

    // Log activity
    await this.logActivity(user.id, 'LOGIN', 'User', user.id, ipAddress, userAgent ? { userAgent } : undefined);

    return {
      accessToken,
      refreshToken: refreshToken.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: this.sanitizeUser(user),
    };
  }

  // ────────────────────────────────────────
  //  PUBLIC: REGISTER (self-registration → STUDENT role)
  // ────────────────────────────────────────
  async register(input: RegisterInput) {
    const libraryId = input.libraryId.trim();
    const email = input.email.toLowerCase().trim();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { libraryId }],
      },
    });
    if (existing) {
      throw new ConflictError(
        existing.email === email
          ? 'An account with this email already exists'
          : 'An account with this ID Number already exists'
      );
    }

    const existingPending = await prisma.pendingStudentRegistration.findFirst({
      where: { OR: [{ email }, { libraryId }] },
      select: { email: true, libraryId: true },
    });
    if (existingPending) {
      throw new ConflictError(
        existingPending.email === email
          ? 'A registration request with this email is already pending'
          : 'A registration request with this ID Number is already pending'
      );
    }

    if (!input.department || !isDepartmentCode(input.department)) {
      throw new BadRequestError('Department must be one of the official programs');
    }
    if (!input.yearSection || !/^[1-4]-[A-Z]$/.test(input.yearSection)) {
      throw new BadRequestError('A valid year and section is required');
    }
    const department = input.department;
    const yearSection = input.yearSection;
    const hashedPassword = await bcrypt.hash(input.password, 12);

    const request = await prisma.$transaction(async (tx) => {
      const pendingRegistration = await tx.pendingStudentRegistration.create({
        data: {
          libraryId,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          password: hashedPassword,
          department,
          yearSection,
          phone: input.phone,
        },
      });

      const librarians = await tx.user.findMany({
        where: { role: 'LIBRARIAN', isActive: true, notificationsEnabled: true },
        select: { id: true },
      });
      if (librarians.length > 0) {
        const name = [input.firstName, input.lastName].filter(Boolean).join(' ');
        await tx.notification.createMany({
          data: librarians.map(({ id }) => ({
            userId: id,
            type: 'SYSTEM',
            title: 'New student registration request',
            message: `New student registration request from ${name} – please verify`,
            link: '/members',
          })),
        });
      }

      return pendingRegistration;
    }).catch((error: unknown) => {
      const conflict = getUserUniqueConflict(error);
      if (conflict) throw conflict;
      throw error;
    });

    return {
      pendingApproval: true,
      requestId: request.id,
    };
  }

  async listPendingStudentRegistrations() {
    return prisma.pendingStudentRegistration.findMany({
      select: {
        id: true,
        libraryId: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        yearSection: true,
        phone: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async approveStudentRegistration(registrationId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    return prisma.$transaction(async (tx) => {
      const registration = await tx.pendingStudentRegistration.findUnique({ where: { id: registrationId } });
      if (!registration) throw new NotFoundError('Pending student registration');

      const user = await tx.user.create({
        data: {
          libraryId: registration.libraryId,
          firstName: registration.firstName,
          lastName: registration.lastName,
          email: registration.email,
          password: registration.password,
          role: 'STUDENT',
          department: registration.department,
          yearSection: registration.yearSection,
          phone: registration.phone,
          isActive: true,
        },
      });
      await tx.pendingStudentRegistration.delete({ where: { id: registrationId } });
      await this.logActivity(adminId, 'APPROVE_REGISTRATION', 'User', user.id, ipAddress, {
        memberName: `${user.firstName} ${user.lastName}`,
        createdUserLibraryId: user.libraryId,
        ...(userAgent ? { userAgent } : {}),
      }, tx);
      return this.sanitizeUser(user);
    }).catch((error: unknown) => {
      const conflict = getUserUniqueConflict(error);
      if (conflict) throw conflict;
      throw error;
    });
  }

  async rejectStudentRegistration(registrationId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    return prisma.$transaction(async (tx) => {
      const registration = await tx.pendingStudentRegistration.findUnique({ where: { id: registrationId } });
      if (!registration) throw new NotFoundError('Pending student registration');

      await tx.pendingStudentRegistration.delete({ where: { id: registrationId } });
      await this.logActivity(adminId, 'REJECT_REGISTRATION', 'PendingStudentRegistration', registration.id, ipAddress, {
        memberName: `${registration.firstName} ${registration.lastName}`,
        createdUserLibraryId: registration.libraryId,
        ...(userAgent ? { userAgent } : {}),
      }, tx);
      return { id: registrationId };
    });
  }

  // ────────────────────────────────────────
  //  ADMIN: Create user with any role (LIBRARIAN only)
  // ────────────────────────────────────────
  async createUser(adminId: string, input: CreateUserInput, ipAddress?: string, userAgent?: string) {
    const actingUser = await prisma.user.findUnique({ where: { id: adminId } });
    if (!actingUser) {
      throw new NotFoundError('User account');
    }

    if (input.role === 'LIBRARIAN' && actingUser.role !== 'LIBRARIAN') {
      throw new ForbiddenError('Only librarians can add new librarian accounts');
    }

    const normalizedLibraryId = input.libraryId?.trim();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: input.email },
          ...(normalizedLibraryId ? [{ libraryId: normalizedLibraryId }] : []),
        ],
      },
    });
    if (existing) {
      if (existing.email === input.email) {
        throw new ConflictError('A user with this email already exists');
      }
      throw new ConflictError('A user with this ID Number already exists');
    }

    const libraryId = normalizedLibraryId || await this.generateLibraryId();
    if ((input.role === 'STUDENT' || input.role === 'FACULTY') && input.department && !isDepartmentCode(input.department)) {
      throw new BadRequestError('Department must be one of the official programs');
    }
    const hashedPassword = await bcrypt.hash(input.password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          libraryId,
          firstName: input.firstName,
          lastName: input.lastName,
          suffix: input.suffix || null,
          email: input.email,
          password: hashedPassword,
          role: input.role,
          department: input.department,
          yearSection: input.yearSection,
          phone: input.phone,
          isActive: true,
        },
      });
      await this.logActivity(adminId, 'CREATE_USER', 'User', createdUser.id, ipAddress, {
        createdUserName: [createdUser.firstName, createdUser.lastName, createdUser.suffix].filter(Boolean).join(' '),
        createdUserLibraryId: createdUser.libraryId,
        createdUserRole: createdUser.role,
        ...(userAgent ? { userAgent } : {}),
      }, tx);
      return createdUser;
    }).catch((error: unknown) => {
      const conflict = getUserUniqueConflict(error);
      if (conflict) throw conflict;
      throw error;
    });

    return this.sanitizeUser(user);
  }

  // ────────────────────────────────────────
  //  REFRESH TOKEN
  // ────────────────────────────────────────
  async refreshAccessToken(refreshTokenStr?: string) {
    if (!refreshTokenStr) {
      throw new UnauthorizedError('Refresh token is required.');
    }

    // Find the stored token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenStr },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if revoked
    if (storedToken.revokedAt) {
      // Token was already used → possible theft: revoke ALL tokens for this user
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError(
        'Refresh token has been revoked. All sessions have been invalidated for security.'
      );
    }

    // Check expiry
    if (new Date() > storedToken.expiresAt) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Refresh token has expired. Please log in again.');
    }

    // Check user active
    if (!storedToken.user.isActive) {
      throw new UnauthorizedError('Account is deactivated.');
    }

    const sessionLifetime = storedToken.expiresAt.getTime() - storedToken.createdAt.getTime();
    const rememberedSession =
      sessionLifetime > (SESSION_REFRESH_TOKEN_TTL_MS + REFRESH_TOKEN_TTL_MS) / 2;
    const now = new Date();
    const nextRefreshToken = crypto.randomBytes(48).toString('hex');
    const nextRefreshExpiresAt = new Date(
      now.getTime() + (rememberedSession ? REFRESH_TOKEN_TTL_MS : SESSION_REFRESH_TOKEN_TTL_MS),
    );
    const rotated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) return false;

      await tx.refreshToken.deleteMany({
        where: { userId: storedToken.userId, expiresAt: { lt: now } },
      });
      await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          token: nextRefreshToken,
          expiresAt: nextRefreshExpiresAt,
        },
      });
      return true;
    });
    if (!rotated) {
      const currentToken = await prisma.refreshToken.findUnique({
        where: { id: storedToken.id },
        select: { revokedAt: true, expiresAt: true },
      });
      if (currentToken?.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { userId: storedToken.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedError('Refresh token has already been used. All sessions have been invalidated for security.');
      }
      throw new UnauthorizedError('Refresh token has expired. Please log in again.');
    }

    const accessToken = this.generateAccessToken(
      storedToken.user.id,
      storedToken.user.libraryId,
      storedToken.user.role
    );

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      rememberedSession,
    };
  }

  // ────────────────────────────────────────
  //  LOGOUT (revoke specific refresh token)
  // ────────────────────────────────────────
  async logout(refreshTokenStr?: string) {
    if (!refreshTokenStr) {
      return;
    }

    await prisma.refreshToken.updateMany({
      where: { token: refreshTokenStr, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ────────────────────────────────────────
  //  LOGOUT ALL SESSIONS
  // ────────────────────────────────────────
  async logoutAll(userId: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ────────────────────────────────────────
  //  CHANGE PASSWORD
  // ────────────────────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password: hashed },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.logActivity(
        userId,
        'CHANGE_PASSWORD',
        'User',
        userId,
        ipAddress,
        userAgent ? { userAgent } : undefined,
        tx,
      );
    });
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: { notificationsEnabled?: boolean; systemNotificationsEnabled?: boolean },
  ) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: preferences,
    });
    return this.sanitizeUser(user);
  }

  // ────────────────────────────────────────
  //  GET PROFILE (with active borrows, reservations, notifications)
  // ────────────────────────────────────────
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        borrowTransactions: {
          where: { status: 'ACTIVE' },
          include: { book: { select: { title: true, accessionNo: true } } },
          orderBy: { borrowDate: 'desc' },
          take: 5,
        },
        reservations: {
          where: { status: { in: ['ACTIVE', 'APPROVED'] } },
          include: { book: { select: { title: true } } },
          orderBy: { reservationDate: 'desc' },
          take: 5,
        },
        notifications: {
          where: { isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            borrowTransactions: { where: { status: 'ACTIVE' } },
            reservations: { where: { status: { in: ['ACTIVE', 'APPROVED'] } } },
            notifications: { where: { isRead: false } },
          },
        },
      },
    });

    if (!user) throw new NotFoundError('User');

    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    department?: string;
    yearSection?: string;
    avatar?: string | null;
  }, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');
    if (user.role === 'STUDENT' && !data.yearSection?.trim()) {
      throw new BadRequestError('Year & Section is required for Student accounts');
    }
    if ((user.role === 'STUDENT' || user.role === 'FACULTY') && !data.department?.trim()) {
      throw new BadRequestError('Department is required for Student and Faculty accounts');
    }
    if (data.department?.trim() && !isDepartmentCode(data.department.trim())) {
      throw new BadRequestError('Department must be one of the official programs');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changedUser = await tx.user.update({
        where: { id: userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone || null,
          department: data.department?.trim() || null,
          yearSection: user.role === 'STUDENT' ? data.yearSection?.trim() : null,
          ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
        },
      });
      await this.logActivity(userId, 'EDIT_MEMBER', 'User', userId, ipAddress, {
        memberName: `${changedUser.firstName} ${changedUser.lastName}`,
        ...(userAgent ? { userAgent } : {}),
      }, tx);
      return changedUser;
    });
    return this.sanitizeUser(updated);
  }

  // ────────────────────────────────────────
  //  LIST USERS (admin)
  // ────────────────────────────────────────
  async listUsers(query: Record<string, unknown>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const { sort, order } = getSortParams(query, ['name', 'joinDate', 'fines', 'libraryId'] as const, 'name', 'asc');

    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    else where.isActive = true;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search as string, mode: 'insensitive' } },
        { lastName: { contains: query.search as string, mode: 'insensitive' } },
        { email: { contains: query.search as string, mode: 'insensitive' } },
        { libraryId: { contains: query.search as string, mode: 'insensitive' } },
      ];
    }

    const orderedIds = sort === 'fines'
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT u.id
          FROM users u
          LEFT JOIN (
            SELECT bt.user_id, SUM(bt.fine_amount) AS total_fine
            FROM borrow_transactions bt
            JOIN books b ON b.id = bt.book_id
            WHERE bt.status::text = 'OVERDUE' AND b.deleted_at IS NULL
            GROUP BY bt.user_id
          ) fines ON fines.user_id = u.id
          WHERE u.is_active = ${query.isActive === undefined ? true : query.isActive === 'true'}
            AND (${query.role ?? null}::text IS NULL OR u.role::text = ${query.role ?? null})
            AND (${query.search ? `%${String(query.search)}%` : null}::text IS NULL OR
              u.first_name ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              u.last_name ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              u.email ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              u.library_id ILIKE ${query.search ? `%${String(query.search)}%` : null})
          ORDER BY COALESCE(fines.total_fine, 0) ${Prisma.raw(order.toUpperCase())}, u.id ASC
          LIMIT ${limit} OFFSET ${skip}
        `
      : sort === 'name'
        ? await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT u.id
            FROM users u
            WHERE u.is_active = ${query.isActive === undefined ? true : query.isActive === 'true'}
              AND (${query.role ?? null}::text IS NULL OR u.role::text = ${query.role ?? null})
              AND (${query.search ? `%${String(query.search)}%` : null}::text IS NULL OR
                u.first_name ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
                u.last_name ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
                u.email ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
                u.library_id ILIKE ${query.search ? `%${String(query.search)}%` : null})
            ORDER BY LOWER(CONCAT_WS(' ', u.first_name, u.last_name)) ${Prisma.raw(order.toUpperCase())}, u.id ASC
            LIMIT ${limit} OFFSET ${skip}
          `
      : null;

    const userSelect = {
      id: true,
      libraryId: true,
      firstName: true,
      lastName: true,
      suffix: true,
      email: true,
      avatar: true,
      role: true,
      department: true,
      yearSection: true,
      phone: true,
      isActive: true,
      createdAt: true,
    } as const;
    const userArgs: Prisma.UserFindManyArgs = orderedIds
      ? { where: { ...where, id: { in: orderedIds.map(({ id }) => id) } }, select: userSelect }
      : {
          where,
          orderBy: [{ [sort === 'joinDate' ? 'createdAt' : sort]: order }, { id: 'asc' }],
          skip,
          take: limit,
          select: userSelect,
        };

    const [userRows, total] = await Promise.all([
      prisma.user.findMany(userArgs),
      prisma.user.count({ where }),
    ]);

    const userMap = new Map(userRows.map((user) => [user.id, user]));
    const users = orderedIds
      ? orderedIds.map(({ id }) => userMap.get(id)).filter((user) => user !== undefined)
      : userRows;

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMemberProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        libraryId: true,
        firstName: true,
        lastName: true,
        suffix: true,
        email: true,
        role: true,
        department: true,
        yearSection: true,
        phone: true,
        avatar: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');

    const [totalBorrowed, recentTransactions, unpaidFineGroups, unpaidMissingTransactions] = await Promise.all([
      prisma.borrowTransaction.count({ where: { userId } }),
      prisma.borrowTransaction.findMany({
        where: { userId },
        orderBy: [{ borrowDate: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          borrowDate: true,
          status: true,
          book: { select: { title: true } },
        },
      }),
      prisma.borrowTransaction.groupBy({
        by: ['status'],
        where: { userId, finePaid: false },
        _sum: { fineAmount: true },
      }),
      prisma.borrowTransaction.findMany({
        where: { userId, status: 'MISSING', finePaid: false },
        select: {
          fineAmount: true,
          book: { select: { replacementValue: true } },
        },
      }),
    ]);

    const finesByStatus = new Map(
      unpaidFineGroups.map(({ status, _sum }) => [status, Number(_sum.fineAmount ?? 0)]),
    );
    const missingOverdueFine = unpaidMissingTransactions.reduce((total, transaction) => {
      const fine = Math.max(0, Number(transaction.fineAmount ?? 0));
      const replacementValue = Math.max(0, Number(transaction.book?.replacementValue ?? 0));
      return total + Math.max(0, fine - replacementValue);
    }, 0);
    const overdueFine = Number((finesByStatus.get('OVERDUE') ?? 0) + missingOverdueFine);
    const otherPenalties = Number(
      ((finesByStatus.get('MISSING') ?? 0) - missingOverdueFine
        + (finesByStatus.get('ACTIVE') ?? 0)
        + (finesByStatus.get('RETURNED') ?? 0)).toFixed(2),
    );

    return {
      member: user,
      totalBorrowed,
      recentTransactions,
      fines: {
        total: Number((overdueFine + otherPenalties).toFixed(2)),
        overdue: Number(overdueFine.toFixed(2)),
        otherPenalties,
      },
    };
  }

// ────────────────────────────────────────
  //  TOGGLE USER ACTIVE STATUS (admin)
  // ────────────────────────────────────────
  async deleteUser(targetUserId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    if (targetUserId === adminId) {
      throw new BadRequestError('You cannot delete your own account');
    }

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');

    // Revoke sessions while preserving the user's history for archive/restore.
    const archivedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId: targetUserId } });
      await tx.user.update({ where: { id: targetUserId }, data: { isActive: false, archivedAt } });
      await this.logActivity(adminId, 'DELETE_USER', 'User', targetUserId, ipAddress, {
        deletedUserName: `${user.firstName} ${user.lastName}`,
        deletedUserLibraryId: user.libraryId,
        deletedUserRole: user.role,
        status: 'Archived',
        ...(userAgent ? { userAgent } : {}),
      }, tx);
    });
    return { id: targetUserId };
  }

  async listArchivedUsers() {
    return prisma.user.findMany({
      where: { isActive: false },
      select: { id: true, libraryId: true, firstName: true, lastName: true, email: true, role: true, createdAt: true, updatedAt: true, archivedAt: true, isActive: true },
      orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async restoreUser(targetUserId: string) {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');
    return prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: true, archivedAt: null, lastLoginAt: new Date() },
    });
  }

  async permanentlyDeleteArchivedUser(targetUserId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    if (targetUserId === adminId) {
      throw new BadRequestError('You cannot delete your own account');
    }
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');
    if (user.isActive) {
      throw new BadRequestError('Only archived user accounts can be permanently deleted');
    }

    await prisma.$transaction(async (tx) => {
      const [activeTransactions, activeReservations, pendingRequests] = await Promise.all([
        tx.borrowTransaction.count({ where: { userId: targetUserId, status: { in: ['ACTIVE', 'OVERDUE'] } } }),
        tx.reservation.count({ where: { userId: targetUserId, status: { in: ['ACTIVE', 'APPROVED'] } } }),
        tx.borrowRequest.count({ where: { userId: targetUserId, status: 'PENDING' } }),
      ]);
      if (activeTransactions || activeReservations || pendingRequests) {
        throw new BadRequestError('This account has active circulation records and cannot be permanently deleted yet');
      }

      await tx.faq.updateMany({ where: { createdById: targetUserId }, data: { createdById: null } });
      await tx.borrowRequest.updateMany({ where: { processedById: targetUserId }, data: { processedById: null } });
      await tx.activityLog.updateMany({ where: { userId: targetUserId }, data: { userId: null } });
      await this.logActivity(adminId, 'PERMANENTLY_DELETE_USER', 'User', targetUserId, ipAddress, {
        deletedUserName: `${user.firstName} ${user.lastName}`,
        deletedUserLibraryId: user.libraryId,
        deletedUserRole: user.role,
        status: 'Permanently deleted',
        ...(userAgent ? { userAgent } : {}),
      }, tx);
      await tx.user.delete({ where: { id: targetUserId } });
    });
    return { id: targetUserId };
  }

  async toggleUserStatus(targetUserId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    if (targetUserId === adminId) {
      throw new BadRequestError('You cannot deactivate your own account');
    }

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');

    const updated = await prisma.$transaction(async (tx) => {
      const changedUser = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isActive: !user.isActive,
          archivedAt: user.isActive ? new Date() : null,
        },
      });
      if (!changedUser.isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.logActivity(
        adminId,
        changedUser.isActive ? 'ACTIVATE_MEMBER' : 'DEACTIVATE_MEMBER',
        'User',
        targetUserId,
        ipAddress,
        {
          memberName: `${changedUser.firstName} ${changedUser.lastName}`,
          ...(userAgent ? { userAgent } : {}),
        },
        tx,
      );
      return changedUser;
    });

    return this.sanitizeUser(updated);
  }

  // ────────────────────────────────────────
  //  PRIVATE HELPERS
  // ────────────────────────────────────────

  /**
   * Generate a short-lived JWT access token.
   * JWT payload contains only: userId, libraryId, role — NO sensitive data.
   */
  private generateAccessToken(userId: string, libraryId: string, role: string): string {
    return jwt.sign(
      { userId, libraryId, role } as JwtPayload,
      env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS } as jwt.SignOptions
    );
  }

  /**
   * Generate a cryptographically random refresh token and store it hashed in DB.
   * Returns the raw token (to deliver to client) and the DB record.
   */
  private async generateRefreshToken(userId: string, ttlMs = REFRESH_TOKEN_TTL_MS) {
    // Clean up expired tokens for this user
    await prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const rawToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + ttlMs);

    const record = await prisma.refreshToken.create({
      data: {
        userId,
        token: rawToken,
        expiresAt,
      },
    });

    return { token: rawToken, record };
  }

  /**
   * Auto-generate next library ID: LIB-YYYY-NNNN
   */
  private async generateLibraryId(): Promise<string> {
    const lastUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { libraryId: true },
    });

    let nextNumber = 1;
    if (lastUser?.libraryId) {
      const parts = lastUser.libraryId.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }

    const year = new Date().getFullYear();
    return `LIB-${year}-${String(nextNumber).padStart(4, '0')}`;
  }

  /**
   * Log an activity to the audit trail
   */
  private async logActivity(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    ipAddress?: string,
    details?: Record<string, string>,
    client: Prisma.TransactionClient = prisma,
  ) {
    const target = details?.bookTitle || details?.memberName || details?.createdUserName || details?.deletedUserName;
    const readableAction = action.replace(/_/g, ' ').toLowerCase();
    await recordActivity({
      userId,
      action,
      description: target ? `${readableAction}: ${target}` : readableAction,
      entity,
      entityId,
      ipAddress,
      details,
    }, client);
  }

  /**
   * Strip password from user object
   */
  private sanitizeUser<T extends { password?: string }>(user: T): Omit<T, 'password'> {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}

export const authService = new AuthService();
