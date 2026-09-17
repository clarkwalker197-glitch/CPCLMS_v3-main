// ============================================================
// Zod Validation Schemas — Authentication & User Management
// ============================================================

import { z } from 'zod';
import { DEPARTMENTS } from '../constants/departments';

const departmentCodeSchema = z.enum(DEPARTMENTS.map((department) => department.code) as [string, ...string[]]);

// Enum values matching the Prisma Role enum
/** @see prisma/schema.prisma Role enum */
const RoleValues = ['STUDENT', 'FACULTY', 'LIBRARIAN'] as const;
const PublicRegistrationRoleValues = ['STUDENT', 'FACULTY'] as const;

export const loginSchema = z.object({
  body: z.object({
    identifier: z
      .string()
      .min(1, 'ID Number or email is required')
      .trim()
      .transform((val) => val.toLowerCase()),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
firstName: z
      .string()
      .min(1, 'First name is required')
      .max(50)
      .transform((s) => s.trim()),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(50)
      .transform((s) => s.trim()),
    libraryId: z
      .string()
      .min(1, 'ID Number is required')
      .max(20)
      .transform((s) => s.trim()),
email: z
      .string()
      .email('Invalid email address')
      .transform((email) => email.toLowerCase().trim()),
    role: z
      .enum(PublicRegistrationRoleValues, {
        errorMap: () => ({ message: 'Role must be STUDENT or FACULTY' }),
      })
      .optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128),
    department: departmentCodeSchema.optional(),
    yearSection: z.string().optional(),
    phone: z.string().optional(),
  }).superRefine((data, ctx) => {
    const role = data.role ?? 'STUDENT';
    if (role === 'STUDENT' && !data.yearSection?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['yearSection'],
        message: 'Year & Section is required for Student accounts',
      });
    }
    if ((role === 'STUDENT' || role === 'FACULTY') && !data.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['department'],
        message: 'Department is required for Student and Faculty accounts',
      });
    }
  }),
});

/** Admin-only: create user with any role */
export const createUserSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(50)
      .transform((s) => s.trim()),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(50)
      .transform((s) => s.trim()),
    email: z
      .string()
      .email('Invalid email address')
      .transform((email) => email.toLowerCase().trim()),
    libraryId: z
      .string()
      .max(20)
      .trim()
      .optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128),
    role: z.enum(RoleValues, {
      errorMap: () => ({ message: 'Role must be STUDENT, FACULTY, or LIBRARIAN' }),
    }),
    department: departmentCodeSchema.optional(),
    yearSection: z.string().optional(),
    phone: z
      .string()
      .regex(/^\+?[\d\s-]{7,15}$/, 'Invalid phone number format')
      .optional(),
  }).superRefine((data, ctx) => {
    if (data.role === 'LIBRARIAN' && !data.libraryId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['libraryId'],
        message: 'ID Number is required for Librarian accounts',
      });
    }

    if ((data.role === 'STUDENT' || data.role === 'FACULTY') && !data.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['department'],
        message: 'Department is required for Student and Faculty accounts',
      });
    }
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128),
  }),
});

export const updateNotificationPreferencesSchema = z.object({
  body: z.object({
    notificationsEnabled: z.boolean(),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required').max(50).transform((s) => s.trim()),
    lastName: z.string().min(1, 'Last name is required').max(50).transform((s) => s.trim()),
    email: z.string().email('Invalid email address').transform((email) => email.toLowerCase().trim()),
    phone: z.string().regex(/^\+?[\d\s-]{7,15}$/, 'Invalid phone number format').optional().or(z.literal('')),
    department: z.string().max(100).optional(),
    yearSection: z.string().max(100).optional(),
    removeProfilePicture: z.enum(['true', 'false']).optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'ID Number or email is required').trim(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  }),
});

export const verifyPasswordResetSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Email is required').trim(),
    code: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
  }),
});

export const googleLoginSchema = z.object({
  body: z.object({
    credential: z.string().min(1, 'Google credential is required'),
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

// Types
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];

