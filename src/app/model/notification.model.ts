export type NotificationCategory =
  | 'booking' | 'payment' | 'journey' | 'trip_update' | 'bus'
  | 'cancellation' | 'refund' | 'offers' | 'promotions' | 'community'
  | 'support' | 'account' | 'security' | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationChannelName = 'inapp' | 'email' | 'push';

export interface NotificationChannelState {
  status: 'pending' | 'sent' | 'failed' | 'disabled';
  error?: string | null;
  retriedAt?: string | null;
  attemptCount?: number;
  deliveredAt?: string | null;
}

export interface AppNotification {
  _id: string;
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  message: string;
  locale: string;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  link: string | null;
  payload: Record<string, any>;
  dedupKey: string | null;
  expiresAt: string | null;
  channels: Record<NotificationChannelName, NotificationChannelState>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsPage {
  items: AppNotification[];
  total: number;
  unread: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Per-category-per-channel preference. Each category has an `enabled` toggle
 *  plus per-channel booleans. Legacy `boolean` values are also accepted. */
export type CategoryPreference =
  | boolean
  | { enabled: boolean; inapp: boolean; email: boolean; push: boolean };

export interface NotificationPreferences {
  userId: string;
  locale: string;
  channels: Record<NotificationChannelName, boolean>;
  categories: Record<NotificationCategory, CategoryPreference>;
  promotionalOptIn: boolean;
  reminderTiers: string[];
  createdAt: string;
  updatedAt: string;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'booking', 'payment', 'journey', 'trip_update', 'bus',
  'cancellation', 'refund', 'offers', 'promotions', 'community',
  'support', 'account', 'security', 'system',
];

export const NOTIFICATION_CHANNELS: NotificationChannelName[] = ['inapp', 'email', 'push'];

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  booking: 'notifications.categories.booking',
  payment: 'notifications.categories.payment',
  journey: 'notifications.categories.journey',
  trip_update: 'notifications.categories.tripUpdate',
  bus: 'notifications.categories.busAlerts',
  cancellation: 'notifications.categories.cancellation',
  refund: 'notifications.categories.refund',
  offers: 'notifications.categories.offers',
  promotions: 'notifications.categories.promotions',
  community: 'notifications.categories.community',
  support: 'notifications.categories.support',
  account: 'notifications.categories.account',
  security: 'notifications.categories.security',
  system: 'notifications.categories.system',
};

/** Material icon per notification category. */
export const NOTIFICATION_CATEGORY_ICON: Record<NotificationCategory, string> = {
  booking: 'confirmation_number',
  payment: 'payments',
  journey: 'event_seat',
  trip_update: 'update',
  bus: 'directions_bus',
  cancellation: 'cancel',
  refund: 'refund',
  offers: 'local_offer',
  promotions: 'campaign',
  community: 'groups',
  support: 'support_agent',
  account: 'account_circle',
  security: 'security',
  system: 'info',
};

/** Priority color classes for UI styling. */
export const PRIORITY_STYLES: Record<NotificationPriority, { bg: string; text: string; border: string }> = {
  low: { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  normal: { bg: '#ffffff', text: '#1f2937', border: '#e5e7eb' },
  high: { bg: '#fffbeb', text: '#92400e', border: '#f59e0b' },
  critical: { bg: '#fef2f2', text: '#991b1b', border: '#ef4444' },
};
