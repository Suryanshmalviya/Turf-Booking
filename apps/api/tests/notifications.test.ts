import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { config } from '../src/config';
import { NotificationModel } from '../src/models/notifications.model';
import {
  countUnread,
  deleteNotification,
  DevelopmentNotificationTransport,
  enqueueNotification,
  markAllAsRead,
  markAsRead,
  processNotificationOutbox,
} from '../src/services/notifications.service';
import { listNotificationsSchema } from '../src/validators/notifications.validator';

const queuedNotification = () => ({
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  channel: 'email' as const,
  subject: 'Booking confirmed',
  body: 'Your booking is confirmed.',
  attemptCount: 0,
  status: 'queued' as 'queued' | 'sent' | 'failed',
  sentAt: undefined as Date | undefined,
  failureReason: undefined as string | undefined,
  nextAttemptAt: new Date(),
  save: vi.fn().mockResolvedValue(undefined),
});

/** Minimal chainable query double covering every builder `paginate` uses. */
const chain = (rows: unknown[]) => {
  const self = {
    skip: vi.fn(() => self),
    limit: vi.fn(() => self),
    select: vi.fn(() => self),
    sort: vi.fn(() => self),
    lean: vi.fn(() => self),
    exec: vi.fn().mockResolvedValue(rows),
  };
  return self;
};

describe('notification outbox', () => {
  it('uses an explicitly labelled development transport', async () => {
    const transport = new DevelopmentNotificationTransport();
    expect(transport.name).toBe('development_logger');
    await expect(
      transport.send({ channel: 'email', subject: 'Test', body: 'secret', recipient: 'user-id' })
    ).resolves.toBeUndefined();
  });

  it('never lets a queue failure break the caller workflow', async () => {
    vi.spyOn(NotificationModel, 'create').mockRejectedValueOnce(
      Object.assign(new Error('write failed'), { code: 11000 })
    );

    await expect(
      enqueueNotification({
        userId: new Types.ObjectId().toString(),
        type: 'booking_confirmed',
        channel: 'email',
        subject: 'Booking confirmed',
        body: 'Confirmed.',
        deduplicationKey: 'dup-key',
      })
    ).resolves.toBeUndefined();
  });

  it('marks delivered notifications as sent', async () => {
    const notification = queuedNotification();
    vi.spyOn(NotificationModel, 'find').mockReturnValue(chain([notification]) as never);
    vi.spyOn(NotificationModel, 'countDocuments').mockResolvedValue(0);

    await expect(processNotificationOutbox()).resolves.toMatchObject({ sent: 1, failed: 0 });
    expect(notification.status).toBe('sent');
    expect(notification.sentAt).toBeInstanceOf(Date);
    expect(notification.save).toHaveBeenCalledOnce();
  });

  it('backs off and gives up after the configured attempt ceiling', async () => {
    const notification = queuedNotification();
    notification.attemptCount = config.notifications.maxAttempts - 1;

    vi.spyOn(NotificationModel, 'find').mockReturnValue(chain([notification]) as never);
    vi.spyOn(NotificationModel, 'countDocuments').mockResolvedValue(0);

    const failing = {
      name: 'failing',
      send: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };

    await expect(processNotificationOutbox(failing)).resolves.toMatchObject({ sent: 0, failed: 1 });
    expect(notification.status).toBe('failed');
    expect(notification.failureReason).toBe('provider unavailable');
    expect(notification.attemptCount).toBe(config.notifications.maxAttempts);
  });

  it('keeps retrying a message that has not reached the ceiling', async () => {
    const notification = queuedNotification();
    notification.attemptCount = 0;

    vi.spyOn(NotificationModel, 'find').mockReturnValue(chain([notification]) as never);
    vi.spyOn(NotificationModel, 'countDocuments').mockResolvedValue(1);

    const failing = {
      name: 'failing',
      send: vi.fn().mockRejectedValue(new Error('temporary outage')),
    };

    const result = await processNotificationOutbox(failing);

    expect(result).toEqual({ sent: 0, failed: 1, remaining: 1 });
    expect(notification.status).toBe('queued');
    expect(notification.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('notification inbox', () => {
  it('validates filter and pagination inputs', () => {
    expect(
      listNotificationsSchema.parse({ query: { unreadOnly: 'true', limit: '5' } }).query
    ).toMatchObject({
      unreadOnly: true,
      limit: 5,
      page: 1,
    });
    expect(listNotificationsSchema.safeParse({ query: { status: 'pending' } }).success).toBe(false);
  });

  it('counts unread notifications for the owner', async () => {
    vi.spyOn(NotificationModel, 'countDocuments').mockResolvedValueOnce(3);
    await expect(countUnread('user-1')).resolves.toEqual({ unread: 3 });
  });

  it('marks a single notification as read once', async () => {
    vi.spyOn(NotificationModel, 'findOneAndUpdate').mockResolvedValueOnce(null);

    await expect(markAsRead('user-1', '507f1f77bcf86cd799439011')).rejects.toThrow(
      'Notification not found'
    );
  });

  it('marks every unread notification as read', async () => {
    vi.spyOn(NotificationModel, 'updateMany').mockResolvedValueOnce({ modifiedCount: 4 } as never);
    await expect(markAllAsRead('user-1')).resolves.toEqual({ updated: 4 });
  });

  it('refuses to delete a notification the caller does not own', async () => {
    vi.spyOn(NotificationModel, 'deleteOne').mockResolvedValueOnce({ deletedCount: 0 } as never);

    await expect(deleteNotification('user-1', '507f1f77bcf86cd799439011')).rejects.toThrow(
      'Notification not found'
    );
  });
});
