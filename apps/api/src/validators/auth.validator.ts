import { z } from 'zod';

import { emailSchema, passwordSchema } from './common.validator';

/**
 * Opaque single-use link token: 32 bytes of CSPRNG output rendered as hex.
 * The pattern rejects anything that could not have been issued by the API, which
 * keeps junk and injection attempts out of the database lookups.
 */
const authTokenSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'Must be a valid verification token');

export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(32).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: authTokenSchema,
      password: passwordSchema,
      confirmPassword: z.string().max(128).optional(),
    })
    .refine(
      value => value.confirmPassword === undefined || value.confirmPassword === value.password,
      {
        message: 'Password confirmation does not match',
        path: ['confirmPassword'],
      }
    ),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: authTokenSchema,
  }),
});

export type RegisterBody = z.infer<typeof registerSchema>['body'];
export type LoginBody = z.infer<typeof loginSchema>['body'];
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>['body'];
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>['body'];
