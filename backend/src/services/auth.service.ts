// ============================================================
// Authentication Service
// Implements JWT access + refresh token rotation (Bearer + httpOnly cookie)
// Security: short-lived access tokens, refresh token rotation, bcrypt(12)
// ============================================================

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config';
import { env } from '../config/env';
import { JwtPayload } from '../types';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
} from '../utils/errors';
import { RegisterInput, CreateUserInput } from '../validators';
import { notificationService } from './notification.service';
import { OAuth2Client } from 'google-auth-library';

export class AuthService {
  async googleLogin(credential: string, ipAddress?: string) {
    if (!env.GOOGLE_CLIENT_ID) throw new BadRequestError('Google authentication is not configured.');
    const ticket = await new OAuth2Client(env.GOOGLE_CLIENT_ID).verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new BadRequestError('Google account email is not verified.');

    let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email: payload.email.toLowerCase() }] } });
    if (user?.googleId && user.googleId !== payload.sub) throw new BadRequestError('This email is linked to another Google account.');
    if (!user) {
      const libraryId = await this.generateLibraryId();
      user = await prisma.user.create({
        data: {
          googleId: payload.sub,
          libraryId,
          firstName: payload.given_name || payload.name?.split(' ')[0] || 'Google',
          lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'User',
          email: payload.email.toLowerCase(),
          password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
          role: 'STUDENT',
          isActive: true,
        },
      });
    } else if (!user.isActive) throw new UnauthorizedError('Your account has been deactivated. Please contact the library.');
    else if (!user.googleId) user = await prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub } });

    const accessToken = this.generateAccessToken(user.id, user.libraryId, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);
    await this.logActivity(user.id, 'LOGIN_GOOGLE', 'User', user.id, ipAddress);
    return { accessToken, refreshToken: refreshToken.token, expiresIn: 15 * 60, user: this.sanitizeUser(user) };
  }

  async requestPasswordReset(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { libraryId: normalized }], isActive: true },
    });
    if (!user) throw new NotFoundError('User account');

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    const frontendUrl = (env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    await notificationService.sendEmail({
      to: user.email,
      userId: user.id,
      subject: 'Your CPC Library password reset code',
      body: `Hello ${user.firstName},\n\nYour password reset verification code is: ${code}\n\nThis code expires in 1 hour.`,
    });

    return { message: 'A verification code has been sent to your registered email.', email: user.email };
  }

  async verifyPasswordReset(identifier: string, code: string) {
    const user = await prisma.user.findFirst({ where: { email: identifier.trim().toLowerCase(), isActive: true } });
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const resetToken = user ? await prisma.passwordResetToken.findFirst({ where: { userId: user.id, tokenHash: codeHash, usedAt: null } }) : null;
    if (!resetToken || resetToken.expiresAt <= new Date()) throw new BadRequestError('Invalid or expired verification code.');
    const resetTokenValue = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { tokenHash: crypto.createHash('sha256').update(resetTokenValue).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
    return { resetToken: resetTokenValue };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new BadRequestError('This password reset link is invalid or expired.');
    }

    const password = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { password } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { message: 'Password reset successfully.' };
  }
  // ────────────────────────────────────────
  //  PUBLIC: LOGIN
  // ────────────────────────────────────────
  async login(identifier: string, password: string, ipAddress?: string) {
    const normalized = (identifier || '').trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { libraryId: normalized }],
      },
    });
    if (!user) {
      throw new UnauthorizedError('Invalid ID Number or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedError(
        'Your account has been deactivated. Please contact the library.'
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid ID Number or password');
    }

    // Generate token pair
    const accessToken = this.generateAccessToken(user.id, user.libraryId, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    // Log activity
    await this.logActivity(user.id, 'LOGIN', 'User', user.id, ipAddress);

    return {
      accessToken,
      refreshToken: refreshToken.token,
      expiresIn: 15 * 60, // seconds (matches JWT_EXPIRES_IN = 15m)
      user: this.sanitizeUser(user),
    };
  }

  // ────────────────────────────────────────
  //  PUBLIC: REGISTER (self-registration → STUDENT role)
  // ────────────────────────────────────────
async register(input: RegisterInput, ipAddress?: string) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { libraryId: input.libraryId }],
      },
    });
    if (existing) {
      throw new ConflictError(
        existing.email === input.email
          ? 'An account with this email already exists'
          : 'An account with this ID Number already exists'
      );
    }

    const libraryId = input.libraryId;
    const hashedPassword = await bcrypt.hash(input.password, 12);

const user = await prisma.user.create({
      data: {
        libraryId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: hashedPassword,
        role: input.role || 'STUDENT',
        department: input.department,
        yearSection: input.yearSection,
        phone: input.phone,
      },
    });

    const accessToken = this.generateAccessToken(user.id, user.libraryId, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    await this.logActivity(user.id, 'REGISTER', 'User', user.id, ipAddress);

    return {
      accessToken,
      refreshToken: refreshToken.token,
      expiresIn: 15 * 60,
      user: this.sanitizeUser(user),
    };
  }

  // ────────────────────────────────────────
  //  ADMIN: Create user with any role (LIBRARIAN only)
  // ────────────────────────────────────────
  async createUser(adminId: string, input: CreateUserInput, ipAddress?: string) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    const libraryId = await this.generateLibraryId();
    const hashedPassword = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        libraryId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: hashedPassword,
        role: input.role,
        department: input.department,
        yearSection: input.yearSection,
        phone: input.phone,
        isActive: true,
      },
    });

    await this.logActivity(adminId, 'CREATE_USER', 'User', user.id, ipAddress);

    return this.sanitizeUser(user);
  }

  // ────────────────────────────────────────
  //  REFRESH TOKEN
  // ────────────────────────────────────────
  async refreshAccessToken(refreshTokenStr: string, ipAddress?: string) {
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

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = this.generateAccessToken(
      storedToken.user.id,
      storedToken.user.libraryId,
      storedToken.user.role
    );
    const newRefreshToken = await this.generateRefreshToken(storedToken.userId);

    await this.logActivity(
      storedToken.userId,
      'TOKEN_REFRESH',
      'User',
      storedToken.userId,
      ipAddress
    );

    return {
      accessToken,
      refreshToken: newRefreshToken.token,
      expiresIn: 15 * 60,
    };
  }

  // ────────────────────────────────────────
  //  LOGOUT (revoke specific refresh token)
  // ────────────────────────────────────────
  async logout(refreshTokenStr: string) {
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
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    // Invalidate all other sessions (security best practice)
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
          where: { status: 'ACTIVE' },
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
            reservations: { where: { status: 'ACTIVE' } },
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
  }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');
    if (user.role === 'STUDENT' && !data.yearSection?.trim()) {
      throw new BadRequestError('Year & Section is required for Student accounts');
    }

    const updated = await prisma.user.update({
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

    return this.sanitizeUser(updated);
  }

  // ────────────────────────────────────────
  //  LIST USERS (admin)
  // ────────────────────────────────────────
  async listUsers(query: Record<string, unknown>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

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

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          libraryId: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          department: true,
          yearSection: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

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

// ────────────────────────────────────────
  //  TOGGLE USER ACTIVE STATUS (admin)
  // ────────────────────────────────────────
  async deleteUser(targetUserId: string, adminId: string) {
    if (targetUserId === adminId) {
      throw new BadRequestError('You cannot delete your own account');
    }

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');

    // Revoke sessions while preserving the user's history for archive/restore.
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: targetUserId } }),
      prisma.user.update({ where: { id: targetUserId }, data: { isActive: false } }),
    ]);

    await this.logActivity(adminId, 'DELETE_USER', 'User', targetUserId);
    return { id: targetUserId };
  }

  async listArchivedUsers() {
    return prisma.user.findMany({
      where: { isActive: false },
      select: { id: true, libraryId: true, firstName: true, lastName: true, email: true, role: true, createdAt: true, updatedAt: true, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async restoreUser(targetUserId: string) {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');
    return prisma.user.update({ where: { id: targetUserId }, data: { isActive: true } });
  }

  async toggleUserStatus(targetUserId: string, adminId: string) {
    if (targetUserId === adminId) {
      throw new BadRequestError('You cannot deactivate your own account');
    }

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundError('User');

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: !user.isActive },
    });

    // If deactivating, revoke all sessions
    if (updated.isActive === false) {
      await prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

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
      { expiresIn: env.JWT_EXPIRES_IN as string } as jwt.SignOptions
    );
  }

  /**
   * Generate a cryptographically random refresh token and store it hashed in DB.
   * Returns the raw token (to deliver to client) and the DB record.
   */
  private async generateRefreshToken(userId: string) {
    // Clean up expired tokens for this user
    await prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const rawToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
    ipAddress?: string
  ) {
    try {
      await prisma.activityLog.create({
        data: { userId, action, entity, entityId, ipAddress },
      });
    } catch {
      // Non-critical — don't block auth flow if logging fails
    }
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

