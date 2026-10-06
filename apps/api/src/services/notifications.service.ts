import type { FilterQuery } from 'mongoose';

import { config, logger } from '../config';
import { type NotificationDocument, NotificationModel } from '../models/notifications.model';
import type { NotificationChannel, NotificationStatus, NotificationType } from '../types/enums';
import type { SortSpec } from '../types/pagination';
import { ApiError } from '../utils/api-error';
import { paginate, paginateWithMeta } from '../utils/paginate';
import { withLegacyPagination } from '../utils/pagination';
import { parseSort, type SortWhitelist } from '../utils/sort';

const NOTIFICATION_SORT_WHITELIST: SortWhitelist = {
  createdAt: 1,
  updatedAt: 1,
  sentAt: 1,
  type: 1,
};

const NOTIFICATION_SORT_FALLBACK: SortSpec = { createdAt: -1 };

export interface NotificationTransport {
  readonly name: string;
  send(input: {
    channel: NotificationChannel;
    subject: string;
    body: string;
    recipient: string;
  }): Promise<void>;
}

/**
 * Default transport. Explicitly labelled so no production code path can
 * silently treat a console write as a delivered message.
 */
export class DevelopmentNotificationTransport implements NotificationTransport {
  public readonly name = 'development_logger';

  public async send(input: {
    channel: NotificationChannel;
    subject: string;
    body: string;
    recipient: string;
  }): Promise<void> {
    logger.info(
      { channel: input.channel, subject: input.subject, recipient: input.recipient },
      '[development-notification-mock] body redacted in development transport'
    );
  }
}

export interface EnqueueInput {
  userId: string;
  bookingId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject: string;
  body: string;
  deduplicationKey: string;
}

/**
 * Transactional outbox write. Failures never propagate to the caller: booking
 * and payment flows must not fail because a notification could not be queued.
 * Duplicate keys are treated as success (idempotent enqueue).
 */
export async function enqueueNotification(input: EnqueueInput): Promise<void> {
  try {
    await NotificationModel.create({
      ...input,
      status: 'queued',
      attemptCount: 0,
      nextAttemptAt: new Date(),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return;
    logger.error(
      { err: error, deduplicationKey: input.deduplicationKey },
      'Failed to queue notification'
    );
  }
}

export interface NotificationListQuery {
  page: number;
  limit: number;
  userId: string;
  status?: NotificationStatus;
  type?: NotificationType;
  unreadOnly?: boolean;
  sort?: string;
}

export async function listNotifications(query: NotificationListQuery) {
  const filter: FilterQuery<NotificationDocument> = { userId: query.userId };
  if (query.status) filter['status'] = query.status;
  if (query.type) filter['type'] = query.type;
  if (query.unreadOnly) filter['readAt'] = { $exists: false };

  const page = await paginateWithMeta<NotificationDocument, Record<string, unknown>>(
    NotificationModel,
    filter,
    {
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, NOTIFICATION_SORT_WHITELIST, NOTIFICATION_SORT_FALLBACK),
      select:
        'type channel status subject body sentAt readAt failureReason attemptCount bookingId createdAt',
    }
  );

  return withLegacyPagination(page);
}

export async function countUnread(userId: string): Promise<{ unread: number }> {
  const unread = await NotificationModel.countDocuments({
    userId,
    readAt: { $exists: false },
  });
  return { unread };
}

export async function markAsRead(userId: string, notificationId: string) {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification');
  return notification;
}

export async function markAllAsRead(userId: string): Promise<{ updated: number }> {
  const result = await NotificationModel.updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );
  return { updated: result.modifiedCount };
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  const result = await NotificationModel.deleteOne({ _id: notificationId, userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Notification');
}

/**
 * Drains the outbox with exponential backoff, giving up after the configured
 * attempt ceiling so a permanently failing message cannot be retried forever.
 */
export async function processNotificationOutbox(
  transport: NotificationTransport = new DevelopmentNotificationTransport()
): Promise<{ sent: number; failed: number; remaining: number }> {
  const now = new Date();
  const batch = await paginate<NotificationDocument, NotificationDocument>(
    NotificationModel,
    { status: 'queued', nextAttemptAt: { $lte: now } },
    { page: 1, limit: config.notifications.batchSize, sort: { createdAt: 1 } }
  );

  let sent = 0;
  let failed = 0;

  for (const notification of batch.items) {
    try {
      await transport.send({
        channel: notification.channel,
        subject: notification.subject,
        body: notification.body,
        recipient: notification.userId.toString(),
      });
      notification.status = 'sent';
      notification.sentAt = new Date();
      await notification.save();
      sent += 1;
    } catch (error) {
      notification.attemptCount += 1;
      notification.failureReason =
        error instanceof Error ? error.message : 'Notification delivery failed';
      notification.nextAttemptAt = new Date(
        Date.now() + Math.min(60 * 60 * 1000, 2 ** notification.attemptCount * 1000)
      );
      if (notification.attemptCount >= config.notifications.maxAttempts) {
        notification.status = 'failed';
      }
      await notification.save();
      failed += 1;
    }
  }

  const remaining = await NotificationModel.countDocuments({ status: 'queued' });
  return { sent, failed, remaining };
}

export function assertNotificationProviderConfigured(provider: string): void {
  if (!provider) {
    throw ApiError.serviceUnavailable(
      'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
      'Notification provider is not configured'
    );
  }
}
