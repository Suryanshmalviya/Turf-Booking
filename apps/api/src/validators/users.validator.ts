import { z } from 'zod';

import {
  emailSchema,
  objectIdSchema,
  paginationSchema,
  passwordSchema,
  sortSchema,
  userRoleSchema,
  userStatusSchema,
} from './common.validator';

export const updateProfileSchema = z.object({
  body: z
    .object({
      displayName: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(32).optional(),
    })
    .refine(value => Object.keys(value).length > 0, {
      message: 'At least one profile field must be provided',
    }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  }),
});

export const sessionIdParamsSchema = z.object({
  params: z.object({ sessionId: z.string().trim().min(8).max(64) }),
});

export const listSessionsSchema = z.object({
  query: z.object(paginationSchema),
});

export const listUsersSchema = z.object({
  query: z.object({
    ...paginationSchema,
    q: z.string().trim().max(160).optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
    sort: sortSchema,
  }),
});

export const getUserSchema = z.object({
  params: z.object({ userId: objectIdSchema }),
});

export const searchUserByEmailSchema = z.object({
  query: z.object({ email: emailSchema }),
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>['body'];
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>['body'];
export type ListUsersQuery = z.infer<typeof listUsersSchema>['query'];
