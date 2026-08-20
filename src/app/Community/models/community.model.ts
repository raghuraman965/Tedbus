export interface CommunityUser {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  badge?: string | null;
  rank?: string;
  bio?: string;
  location?: string;
  coverImage?: string;
  joinedAt?: string | null;
  postsCount?: number;
  followers?: number;
  following?: number;
  totalLikes?: number;
  isFollowing?: boolean;
  isSuspended?: boolean;
  achievements?: Achievement[];
}

export interface Achievement {
  icon: string;
  title: string;
  description: string;
}

export interface CommunityComment {
  id: string;
  user: CommunityUser;
  content: string;
  likes: number;
  liked: boolean;
  timePosted: string;
  edited?: boolean;
  replies: CommunityComment[];
  editing?: boolean;
}

export interface CommunityPost {
  id: string;
  user: CommunityUser;
  title: string;
  story: string;
  route: string;
  destination: string;
  travelDate: string;
  images: string[];
  tips: string[];
  tags: string[];
  category: string;
  likes: number;
  liked: boolean;
  bookmarked: boolean;
  commentsCount: number;
  shares: number;
  views: number;
  reportCount: number;
  timePosted: string;
  editedAt: string | null;
  comments: CommunityComment[];
}

export interface TrendingRoute {
  route: string;
  postsCount: number;
}

export interface PopularDestination {
  name: string;
  image: string;
  postsCount: number;
}

export interface TopContributor {
  user: CommunityUser;
  points: number;
}

export interface Hashtag {
  name: string;
  count: number;
}

export interface SearchResults {
  users: CommunityUser[];
  posts: CommunityPost[];
  destinations: { name: string; count: number }[];
  hashtags: Hashtag[];
}

export interface CommunityNotification {
  id: string;
  actor: CommunityUser | null;
  type: 'like' | 'comment' | 'reply' | 'follow' | 'mention' | 'post_approved' | 'verification_approved' | 'system';
  postId?: string;
  commentId?: string;
  message: string;
  read: boolean;
  timePosted: string;
}

export interface NotificationsPage {
  notifications: CommunityNotification[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  unreadCount: number;
}

export interface RecentReport {
  id: string;
  reporter: CommunityUser;
  targetUser: CommunityUser | null;
  postId: string;
  postTitle: string | null;
  reason: string;
  details: string;
  status: 'pending' | 'actioned' | 'dismissed';
  timePosted: string;
}

export interface ReportedUser {
  user: CommunityUser;
  reportCount: number;
  reasons: string[];
  suspended: boolean;
}

export interface CommunityStats {
  totalUsers: number;
  totalPosts: number;
  activePosts: number;
  totalComments: number;
  totalLikes: number;
  totalBookmarks: number;
  pendingReports: number;
  totalFollows: number;
}

export interface FollowResponse {
  following: boolean;
  followerCount: number;
  followingCount: number;
}

export interface Category {
  name: string;
  nameKey: string;
  icon: string;
}

export interface PostsPage {
  posts: CommunityPost[];
  page: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
}

export interface FilterOptions {
  routes: string[];
  destinations: string[];
}

export const REPORT_REASON_KEYS: string[] = ['spam', 'abuse', 'fakeInfo', 'harassment', 'other'];

const REPORT_REASON_I18N: Record<string, string> = {
  'spam': 'community.reportReason.spam',
  'abuse': 'community.reportReason.abuse',
  'fakeInfo': 'community.reportReason.fakeInfo',
  'harassment': 'community.reportReason.harassment',
  'other': 'community.reportReason.other',
};

export function reportReasonI18nKey(key: string): string {
  return REPORT_REASON_I18N[key] || key;
}
