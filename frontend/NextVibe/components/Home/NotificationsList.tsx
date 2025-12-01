import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  useColorScheme,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import getNotifications from '@/src/api/get.notifications';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import readNotifications from '@/src/api/read.notifications';

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
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
      backgroundColor: 'transparent',
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
    noNotificationsContainer: {
        paddingTop: 100,
        alignItems: 'center',
        justifyContent: 'center'
    },
    noNotificationsText: {
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginTop: 16,
      fontSize: 16,
    },
    skeletonContainer: {
        paddingTop: 8,
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
    replyQuoteBlock: {
      marginTop: 8,
      paddingLeft: 12,
      borderLeftWidth: 3,
      borderLeftColor: themeColors.border,
    },
    replyQuoteText: {
      color: themeColors.textSecondary,
      fontSize: 13,
      fontStyle: 'italic',
      lineHeight: 18,
    },
    replyText: {
      color: themeColors.text, 
      fontSize: 14,
      marginTop: 4, 
      lineHeight: 19,
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
    background: 'transparent',
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

  const fetchReadNotifications = async () => {
    await readNotifications();
  }
  useEffect(() => {
    fetchNotifications(1, true);
    setTimeout(() => {
      fetchReadNotifications();
    }, 2000)
    
  }, []);

  const handleEndReached = () => {
    if (loadMore && !isLoadingMore && !isLoading && !isRefreshing) {
      fetchNotifications(page, false);
    }
  };

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
    
    const systemNotifications = ['deleted_post', 'moderation_success', 'moderation_fail', 'revived_transaction'];
    const isSystemNotification = systemNotifications.includes(notification.notification_type);

    if (isSystemNotification) {
      const bgColor = iconData.color.length === 9 
        ? iconData.color.slice(0, 7) + '30'
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

    return (
      <View style={styles.avatarContainer}>
        <FastImage
          source={{ uri: `${notification.sender__avatar}` }}
          style={styles.avatar}
        />
        <View style={[styles.iconBadge, { backgroundColor: isDarkTheme ? '#1A1A1A' : '#FFFFFF' }]}>
          <MaterialCommunityIcons
            name={iconData.icon as any}
            size={16}
            color={iconData.color}
          />
        </View>
      </View>
    );
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const { main, sub } = parseTextPreview(item.text_preview);
    const isUnread = !item.is_read;

    return (
      <View
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
          {renderAvatar(item)}

          <View style={styles.notificationTextContainer}>
            <View style={styles.notificationTextRow}>
                
              <Text style={styles.notificationText}>
                {item.sender__username && (
                    <Text style={styles.username}>
                        {item.sender__username}{' '}
                    </Text>
                )}

               
                {main.replace(item.sender__username, '').trim()}
              </Text>
              {isUnread && <View style={styles.unreadIndicator} />}
            </View>
            
           {sub && (
              <Text style={styles.notificationSubText} numberOfLines={2}>
                {sub}
              </Text>
            )}
            
            {item.notification_type === 'comment_reply' && (
              <View style={styles.replyQuoteBlock}>
                {item.comment__content && (
                  <Text style={styles.replyQuoteText} numberOfLines={2}>
                    "{item.comment__content}"
                  </Text>
                )}
                {item.comment_reply__content && (
                  <Text style={styles.replyText} numberOfLines={2}>
                    {item.comment_reply__content}
                  </Text>
                )}
              </View>
            )}
            
            {item.notification_type === 'comment' && item.comment__content && (
              <Text style={styles.notificationSubText} numberOfLines={2}>
                "{item.comment__content}"
              </Text>
            )}
            
            {item.post__about && (
              <Text style={styles.notificationSubText} numberOfLines={1}>
                Post: {item.post__about}
              </Text>
            )}
            
            <Text style={styles.timestamp}>
              {formatTimestamp(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderListFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={isDarkTheme ? '#A78BFA' : '#5856D6'} />
      </View>
    );
  };

  const renderEmptyList = () => {
    if (isLoading) {
      return (
        <View style={styles.skeletonContainer}>
          {[...Array(5)].map((_, index) => (
            <View key={index} style={styles.skeletonRow}>
              <View style={styles.skeletonCircle} />
              <View style={styles.skeletonTextBlock}>
                <View style={styles.skeletonLineShort} />
                <View style={styles.skeletonLineLong} />
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (notifications.length === 0) {
      return (
        <View style={styles.noNotificationsContainer}>
            <MaterialCommunityIcons name="bell-off-outline" size={64} color={themeColors.textSecondary} />
            <Text style={styles.noNotificationsText}>No notifications yet</Text>
        </View>
      );
    }
    
    return null;
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
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={28}
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
        </View>
      </View>

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id.toString()}
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderListFooter}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyList}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={isDarkTheme ? '#A78BFA' : '#5856D6'}
            colors={["#A78BFA", "#5856D6"]}
          />
        }
      />
    </LinearGradient>
  );
}