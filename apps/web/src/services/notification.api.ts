import { buildQuery, request, requestWithMeta } from './api-client';

/** The caller's own notification inbox. Every endpoint requires a session. */

export interface NotificationRecord {
  _id: string;
  type: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationFilters {
  status?: 'unread' | 'read';
  type?: string;
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface MarkAllReadResult {
  updated: number;
}

export const notificationApi = {
  async list(filters: NotificationFilters = {}, signal?: AbortSignal) {
    const { data, meta } = await requestWithMeta<NotificationRecord[]>(
      `/notifications${buildQuery({ ...filters })}`,
      { signal }
    );
    return { notifications: data ?? [], meta };
  },

  unreadCount(signal?: AbortSignal) {
    return request<{ unread: number }>('/notifications/unread-count', { signal });
  },

  markRead(notificationId: string) {
    return request<{ notification: NotificationRecord }>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  },

  markAllRead() {
    return request<MarkAllReadResult>('/notifications/read-all', { method: 'POST', body: {} });
  },

  remove(notificationId: string) {
    return request<void>(`/notifications/${notificationId}`, { method: 'DELETE' });
  },
};
