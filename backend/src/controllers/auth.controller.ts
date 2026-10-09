// ============================================================
// Authentication Controller
// ============================================================

import { Request, Response } from 'express';
import { authService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';
import { DEPARTMENTS } from '../constants/departments';
import { env } from '../config/env';
import {
  storeProfileImage,
  tryDeleteNewProfileImage,
  tryDeleteUnreferencedProfileImage,
} from '../services/profile-image-storage.service';

const getRefreshTokenFromRequest = (req: Request): string | undefined => {
  const signedCookieToken = typeof (req as any).signedCookies?.refreshToken === 'string'
    ? (req as any).signedCookies.refreshToken
    : undefined;
  const cookieToken = typeof (req as any).cookies?.refreshToken === 'string'
    ? (req as any).cookies.refreshToken
    : undefined;
  const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  return signedCookieToken || cookieToken || bodyToken;
};

const setRefreshCookie = (res: Response, token: string, expiresAt: Date): void => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    signed: true,
    expires: expiresAt,
  });
};

const clearRefreshCookie = (res: Response): void => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
};

export const getDepartments = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, DEPARTMENTS);
});

/**
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body;
  const ipAddress = req.ip;
  const result = await authService.login(identifier, password, ipAddress, req.get('user-agent'));
  setRefreshCookie(res, result.refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  sendSuccess(res, result, 'Login successful');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.requestPasswordReset(req.body.identifier);
  sendSuccess(res, result, result.message);
});

export const verifyPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.verifyPasswordReset(req.body.identifier, req.body.code);
  sendSuccess(res, result, 'Verification code accepted');
});

export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.googleLogin(req.body.credential, req.ip, req.get('user-agent'));
  setRefreshCookie(res, result.refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  sendSuccess(res, result, 'Google login successful');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.resetPassword(req.body.token, req.body.newPassword, req.ip, req.get('user-agent'));
  sendSuccess(res, result, result.message);
});

/**
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const ipAddress = req.ip;
  const result = await authService.register(req.body, ipAddress, req.get('user-agent'));
  setRefreshCookie(res, result.refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  sendSuccess(res, result, 'Registration successful', 201);
});

/**
 * POST /api/auth/admin/users  (LIBRARIAN only)
 */
export const createUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ipAddress = req.ip;
  const user = await authService.createUser(req.user!.userId, req.body, ipAddress, req.get('user-agent'));
  sendSuccess(res, user, 'User created successfully', 201);
});

/**
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token = getRefreshTokenFromRequest(req);
  const result = await authService.refreshAccessToken(token);
  setRefreshCookie(res, result.refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  sendSuccess(res, result, 'Token refreshed successfully');
});

/**
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const token = getRefreshTokenFromRequest(req);
  if (token) {
    await authService.logout(token);
  }
  clearRefreshCookie(res);
  sendSuccess(res, null, 'Logged out successfully');
});

/**
 * POST /api/auth/logout-all
 */
export const logoutAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.logoutAll(req.user!.userId);
  clearRefreshCookie(res);
  sendSuccess(res, null, 'All sessions logged out successfully');
});

/**
 * GET /api/auth/me
 */
export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.getProfile(req.user!.userId);
  sendSuccess(res, user);
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const removePicture = req.body.removeProfilePicture === 'true';
  const isChangingPicture = Boolean(req.file) || removePicture;
  const currentAvatar = isChangingPicture
    ? (await authService.getProfile(req.user!.userId)).avatar
    : undefined;
  const avatar = req.file
    ? await storeProfileImage(req.file)
    : removePicture
      ? null
      : undefined;

  let user;
  try {
    user = await authService.updateProfile(
      req.user!.userId,
      { ...req.body, avatar },
      req.ip,
      req.get('user-agent')
    );
  } catch (error) {
    if (req.file) await tryDeleteNewProfileImage(avatar);
    throw error;
  }

  if (currentAvatar && currentAvatar !== avatar) {
    await tryDeleteUnreferencedProfileImage(currentAvatar);
  }
  sendSuccess(res, user, 'Profile updated successfully');
});

/**
 * PUT /api/auth/change-password
 */
export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.userId, currentPassword, newPassword, req.ip, req.get('user-agent'));
  sendSuccess(res, null, 'Password changed successfully');
});

export const updateNotificationPreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.updateNotificationPreferences(
    req.user!.userId,
    req.body.notificationsEnabled
  );
  sendSuccess(res, user, 'Notification preferences updated successfully');
});

/**
 * GET /api/auth/users  (LIBRARIAN only)
 */
export const listUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await authService.listUsers(req.query as Record<string, unknown>);
  sendSuccess(res, result.users, undefined, 200, result.meta);
});

/**
 * DELETE /api/auth/users/:id  (LIBRARIAN only)
 */
export const deleteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.deleteUser(req.params.id, req.user!.userId, req.ip, req.get('user-agent'));
  sendSuccess(res, user, 'User deleted successfully');
});

/**
 * PATCH /api/auth/users/:id/toggle-status  (LIBRARIAN only)
 */
export const toggleUserStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.toggleUserStatus(req.params.id, req.user!.userId, req.ip, req.get('user-agent'));
  const status = user.isActive ? 'activated' : 'deactivated';
  sendSuccess(res, user, `User ${status} successfully`);
});
