import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  useColorScheme,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import getNotifications from '@/src/api/get.notifications';
import GetApiUrl from '@/src/utils/url_api';

const icons = {
  like: {
    icon: "heart-outline",
    color: "#7F00FF",
  },
  comment: {
    icon: "comment-plus-outline",
    color: "#7F00FF",
  },
  comment_reply: {
    icon: "comment-plus-outline",
    color: "#7F00FF",
  },
  comment_like: {
    icon: "heart-outline",
    color: "#7F00FF",
  },
  follow: {
    icon: "account-outline",
    color: "#00b7ffff",
  },
  revived_transaction: {
    icon: "arrow-down-bold-circle-outline",
    color: "#03fa13ff",
  },
  deleted_post: {
    icon: "delete-alert-outline",
    color: "#fa0101ff"
  },
  moderation_success: {
    icon: "check-decagram-outline",
    color: "#03fa13ff",
  },
  moderation_fail: {
    icon: "close-circle-multiple-outline",
    color: "#fa0101ff"
  }
};

type NotificationType = 
  | 'like'
  | 'comment'
  | 'comment_reply'
  | 'comment_like'
  | 'follow'
  | 'revived_transaction'
  | 'deleted_post'
  | 'moderation_success'
  | 'moderation_fail';

interface Notification {
  id: number;
  sender__user_id: number;
  sender__username: string;
  sender__avatar: string;
  notification_type: NotificationType;
  post: number | null;
  post__about: string | null;
  comment: number | null;
  comment__content: string | null;
  comment_reply: number | null;
  comment_reply__content: string | null;
  text_preview: string;
  is_read: boolean;
  created_at: string;
}

const getStyles = (isDarkTheme: boolean, themeColors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
      backgroundColor: isDarkTheme ? '#0A0410' : '#FFFFFF',
    },
    scrollContentContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 30,
    },
    titleWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backIcon: {
      color: themeColors.text,
      marginRight: 12,
    },
    title: {
      color: themeColors.text,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    notificationItem: {
      flexDirection: 'row',
      borderRadius: 18,
      marginBottom: 14,
      borderWidth: 1,
      overflow: 'hidden',
    },
    notificationItemRead: {
      borderColor: themeColors.border,
    },
    notificationItemUnread: {
      borderColor: themeColors.unreadBorder,
    },
    notificationContent: {
      flexDirection: 'row',
      padding: 16,
      width: '100%',
      alignItems: 'flex-start',
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
      marginTop: 2,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    systemAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: themeColors.background,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: themeColors.background,
    },
    notificationTextContainer: {
      flex: 1,
      justifyContent: 'flex-start',
      paddingRight: 8,
    },
    notificationTextRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      marginBottom: 4,
    },
    notificationText: {
      color: themeColors.text,
      fontSize: 15,
      lineHeight: 20,
      flex: 1,
    },
    username: {
      fontWeight: '700',
    },
    notificationSubText: {
      color: themeColors.textSecondary,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },
    timestamp: {
      color: themeColors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    noNotificationsText: {
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginTop: 32,
      fontSize: 16,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDarkTheme
        ? 'rgba(255, 255, 255, 0.05)'
        : 'rgba(255, 255, 255, 0.7)',
      padding: 16,
      borderRadius: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    skeletonCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: themeColors.skeletonHighlight,
      marginRight: 12,
    },
    skeletonTextBlock: {
      flex: 1,
      justifyContent: 'center',
    },
    skeletonLineShort: {
      width: '70%',
      height: 16,
      backgroundColor: themeColors.skeletonHighlight,
      borderRadius: 8,
      marginBottom: 8,
    },
    skeletonLineLong: {
      width: '50%',
      height: 14,
      backgroundColor: themeColors.skeletonHighlight,
      borderRadius: 8,
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    unreadIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#7F00FF',
      marginLeft: 6,
      marginTop: 6,
    },
    loadingMoreContainer: {
      paddingVertical: 20,
      alignItems: 'center',
    },
  });

export default function NotificationsListPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadMore, setLoadMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const isDarkTheme = useColorScheme() === 'dark';
  const router = useRouter();

  const themeColors = {
    background: isDarkTheme ? '#0A0410' : '#FFFFFF',
    text: isDarkTheme ? '#F1F5F9' : '#1E293B',
    textSecondary: isDarkTheme ? '#94A3B8' : '#64748B',
    border: isDarkTheme 
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(220, 220, 220, 0.5)',
    unreadBorder: isDarkTheme
      ? 'rgba(127, 0, 255, 0.4)'
      : 'rgba(127, 0, 255, 0.3)',
    skeletonHighlight: isDarkTheme
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.08)',
  };

  const styles = useMemo(
    () => getStyles(isDarkTheme, themeColors),
    [isDarkTheme],
  );

  const fetchNotifications = async (pageNum: number, isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const response = await getNotifications(pageNum);
      
      if (isInitial) {
        setNotifications(response.data.notify);
      } else {
        setNotifications(prev => [...prev, ...response.data.notify]);
      }
      
      setLoadMore(response.data.load_more);
      
      if (response.data.load_more) {
        setPage(pageNum + 1);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      if (isInitial) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPage(1);
    try {
      const response = await getNotifications(1);
      setNotifications(response.data.notify);
      setLoadMore(response.data.load_more);
      if (response.data.load_more) {
        setPage(2);
      }
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(1, true);
  }, []);

  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && loadMore && !isLoadingMore && !isLoading && !isRefreshing) {
      fetchNotifications(page, false);
    }
  }, [loadMore, isLoadingMore, isLoading, isRefreshing, page]);

  const parseTextPreview = (text_preview: string) => {
    try {
      const parsed = JSON.parse(text_preview);
      if (Array.isArray(parsed) && parsed.length === 2) {
        return {
          main: parsed[0],
          sub: parsed[1],
        };
      }
    } catch (e) {
      // Not JSON, return as is
    }
    return {
      main: text_preview,
      sub: null,
    };
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const renderAvatar = (notification: Notification) => {
    const iconData = icons[notification.notification_type] || icons.follow;
    
    // Системні типи сповіщень
    const systemNotifications = ['deleted_post', 'moderation_success', 'moderation_fail', 'revived_transaction'];
    const isSystemNotification = systemNotifications.includes(notification.notification_type);

    if (isSystemNotification) {
      // Для системних сповіщень показуємо велику іконку
      const bgColor = iconData.color.length === 9 
        ? iconData.color.slice(0, 7) + '30' // Додаємо прозорість
        : iconData.color + '30';
      
      return (
        <View style={styles.avatarContainer}>
          <View style={[styles.systemAvatar, { backgroundColor: bgColor }]}>
            <MaterialCommunityIcons
              name={iconData.icon as any}
              size={28}
              color={iconData.color}
            />
          </View>
        </View>
      );
    }

    // Для звичайних сповіщень від користувачів
    return (
      <View style={styles.avatarContainer}>
        <FastImage
          source={{ uri: `${GetApiUrl().slice(0, 25)}/media/${notification.sender__avatar}` }}
          style={styles.avatar}
        />
        <View style={styles.iconBadge}>
          <MaterialCommunityIcons
            name={iconData.icon as any}
            size={16}
            color={iconData.color}
          />
        </View>
      </View>
    );
  };

  const renderNotification = (notification: Notification) => {
    const { main, sub } = parseTextPreview(notification.text_preview);
    const isUnread = !notification.is_read;

    return (
      <View
        key={notification.id}
        style={[
          styles.notificationItem,
          isUnread ? styles.notificationItemUnread : styles.notificationItemRead,
        ]}
        
      >
        <BlurView
          intensity={isDarkTheme ? 30 : 90}
          tint={isDarkTheme ? 'dark' : 'light'}
          style={styles.blurViewAbsolute}
        />
        <View style={styles.notificationContent}>
          {renderAvatar(notification)}

          <View style={styles.notificationTextContainer}>
            <View style={styles.notificationTextRow}>
                
              <Text style={styles.notificationText}>
                {notification.sender__username && (
                    <Text style={styles.username}>
                        {notification.sender__username}{' '}
                    </Text>
                )}

               
                {main.replace(notification.sender__username, '').trim()}
              </Text>
              {isUnread && <View style={styles.unreadIndicator} />}
            </View>
            
            {sub && (
              <Text style={styles.notificationSubText} numberOfLines={2}>
                {sub}
              </Text>
            )}
            
            {notification.comment__content && notification.notification_type === 'comment' && (
              <Text style={styles.notificationSubText} numberOfLines={2}>
                "{notification.comment__content}"
              </Text>
            )}
            
            {notification.post__about && (
              <Text style={styles.notificationSubText} numberOfLines={1}>
                Post: {notification.post__about}
              </Text>
            )}
            
            <Text style={styles.timestamp}>
              {formatTimestamp(notification.created_at)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={
        isDarkTheme
          ? ['#0A0410', '#1a0a2e', '#0A0410']
          : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
      }
      style={{ flex: 1 }}
    >
      <StatusBar backgroundColor={isDarkTheme ? "#0A0410" : "#FFFFFF"} />
      
      <View style={styles.header}>
        <View style={styles.titleWrapper}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={28}
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#7F00FF"
            colors={["#7F00FF"]}
          />
        }
      >
        {isLoading
          ? [...Array(5)].map((_, index) => (
              <View key={index} style={styles.skeletonRow}>
                <View style={styles.skeletonCircle} />
                <View style={styles.skeletonTextBlock}>
                  <View style={styles.skeletonLineShort} />
                  <View style={styles.skeletonLineLong} />
                </View>
              </View>
            ))
          : notifications.length > 0
          ? (
            <>
              {notifications.map(renderNotification)}
              {isLoadingMore && (
                <View style={styles.loadingMoreContainer}>
                  <ActivityIndicator size="small" color="#7F00FF" />
                </View>
              )}
            </>
          )
          : (
            <Text style={styles.noNotificationsText}>No notifications yet</Text>
          )}
      </ScrollView>
    </LinearGradient>
  );
}