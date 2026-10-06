import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationApi,type NotificationFilters } from '../services/notification.api';
import { queryKeys } from '../services/queryKeys';
import { useAuth } from './useAuth';

/** The signed-in customer's notification inbox. */

export function useNotifications(filters: NotificationFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.list(filters),
    queryFn: ({ signal }) => notificationApi.list(filters, signal),
    enabled,
  });
}

/** Badge counter. Disabled for anonymous visitors so no request is wasted. */
export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: ({ signal }) => notificationApi.unreadCount(signal),
    enabled: Boolean(user),
    // A badge does not need to be exact to the second.
    staleTime: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationApi.markRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: result => {
      // The server returns the number it changed, so the badge can be zeroed
      // immediately instead of waiting for the next fetch.
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), { unread: 0 });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
      return result;
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationApi.remove(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}
