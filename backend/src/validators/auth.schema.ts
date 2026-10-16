// ============================================================
// Zod Validation Schemas — Authentication & User Management
// ============================================================

import { z } from 'zod';
import { DEPARTMENTS } from '../constants/departments';

const departmentCodeSchema = z.enum(DEPARTMENTS.map((department) => department.code) as [string, ...string[]]);

// Enum values matching the Prisma Role enum
/** @see prisma/schema.prisma Role enum */
const RoleValues = ['STUDENT', 'FACULTY', 'LIBRARIAN'] as const;
const nameSchema = (label: string) => z
  .string()
  .min(1, `${label} is required`)
  .max(50)
  .trim()
  .regex(/^\p{L}+(?:[ '\u2019-]\p{L}+)*$/u, `${label} can only contain letters, spaces, hyphens, and apostrophes`);
const emailSchema = z
  .string()
  .email('Invalid email address')
  .max(50, 'Email must be at most 50 characters')
  .transform((email) => email.toLowerCase().trim());
const phoneSchema = z
  .string()
  .max(11, 'Phone must be at most 11 digits')
  .regex(/^\d{0,11}$/, 'Phone must contain digits only')
  .optional();

export const loginSchema = z.object({
  body: z.object({
    identifier: z
      .string()
      .min(1, 'ID Number or email is required')
      .trim()
      .transform((val) => val.toLowerCase()),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    firstName: nameSchema('First name'),
    lastName: nameSchema('Last name'),
    libraryId: z
      .string()
      .trim()
      .length(8, 'ID Number must contain exactly 8 digits')
      .regex(/^\d{8}$/, 'ID Number must contain exactly 8 digits'),
    email: emailSchema,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .refine(
        (password) => [/[A-Za-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9\s]/.test(password)].filter(Boolean).length >= 2,
        'Password must include at least two of letters, numbers, or symbols'
      ),
    department: departmentCodeSchema.optional(),
    yearSection: z.string().trim().max(4).optional(),
    phone: phoneSchema,
  }).superRefine((data, ctx) => {
    if (!/^[1-4]-[A-Z]$/.test(data.yearSection?.trim() || '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['yearSection'],
        message: 'Select a valid year and section',
      });
    }
    if (!data.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['department'],
        message: 'Department is required for Student accounts',
      });
    }
  }),
});

/** Admin-only: create user with any role */
export const createUserSchema = z.object({
  body: z.object({
    firstName: nameSchema('First name'),
    lastName: nameSchema('Last name'),
    suffix: z.string().trim().max(20).optional(),
    email: emailSchema,
    libraryId: z
      .string()
      .trim()
      .max(20)
      .optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128),
    role: z.enum(RoleValues, {
      errorMap: () => ({ message: 'Role must be STUDENT, FACULTY, or LIBRARIAN' }),
    }),
    department: departmentCodeSchema.optional(),
    yearSection: z.string().trim().max(4).optional(),
    phone: phoneSchema,
  }).superRefine((data, ctx) => {
    if (data.role === 'LIBRARIAN' && !data.libraryId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['libraryId'],
        message: 'ID Number is required for Librarian accounts',
      });
    }

    if (data.role === 'STUDENT' && !/^\d{8}$/.test(data.libraryId?.trim() || '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['libraryId'],
        message: 'Student ID Number must contain exactly 8 digits',
      });
    }

    if (data.role === 'STUDENT' && !/^[1-4]-[A-Z]$/.test(data.yearSection?.trim() || '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['yearSection'],
        message: 'Select a valid year and section',
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
      .max(128)
      .refine(
        (password) => [/[A-Za-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9\s]/.test(password)].filter(Boolean).length >= 2,
        'New password must include at least two of letters, numbers, or symbols'
      ),
  }),
});

export const updateNotificationPreferencesSchema = z.object({
  body: z.object({
    notificationsEnabled: z.boolean().optional(),
    systemNotificationsEnabled: z.boolean().optional(),
  }).refine(
    (preferences) => Object.keys(preferences).length > 0,
    'At least one notification preference must be provided',
  ),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: nameSchema('First name'),
    lastName: nameSchema('Last name'),
    email: emailSchema,
    phone: phoneSchema,
    department: z.string().max(100).optional(),
    yearSection: z.string().max(100).optional(),
    removeProfilePicture: z.enum(['true', 'false']).optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required').optional(),
    rememberMe: z.boolean().optional(),
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
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .refine(
        (password) => [/[A-Za-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9\s]/.test(password)].filter(Boolean).length >= 2,
        'Password must include at least two of letters, numbers, or symbols'
      ),
  }),
});

export const verifyPasswordResetSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Email is required').trim(),
    code: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
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
