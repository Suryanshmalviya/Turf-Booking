import type { Request, Response } from 'express';

import {
  countUnread,
  deleteNotification,
  listNotifications,
  markAllAsRead,
  markAsRead,
} from '../services/notifications.service';
import { sendNoContent, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import type { ListNotificationsQuery } from '../validators/notifications.validator';

export const list = asyncHandler(async (request: Request, response: Response) => {
  const result = await listNotifications({
    ...(request.query as unknown as ListNotificationsQuery),
    userId: request.user!.sub,
  });

  sendSuccess(response, result.items, { meta: result.meta });
});

export const unreadCount = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await countUnread(request.user!.sub));
});

export const markRead = asyncHandler(async (request: Request, response: Response) => {
  const notification = await markAsRead(request.user!.sub, request.params.notificationId);
  sendSuccess(response, { notification });
});

export const markAllRead = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await markAllAsRead(request.user!.sub));
});

export const remove = asyncHandler(async (request: Request, response: Response) => {
  await deleteNotification(request.user!.sub, request.params.notificationId);
  sendNoContent(response);
});
