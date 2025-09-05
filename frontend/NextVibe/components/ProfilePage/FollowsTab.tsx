import React, { useState, useRef, useEffect, use, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, StatusBar, Animated, FlatList, Dimensions, RefreshControl, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import getFollows from '@/src/api/get.follows'; 
import getReaders from '@/src/api/get.readers'; 
import FastImage from 'react-native-fast-image';
import GetApiUrl from '@/src/utils/url_api';

type UserData = {
    user_id: number;
    username: string;
    avatar: string | null;
}

export default function FollowsScreen() {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();

    // Get the userId and username from the route params
    const { last_page, activeTab, userId, username } = useLocalSearchParams();

    // Tab State
    const [activeTabState, setActiveTab] = useState(activeTab || 'Readers');

    // Animated Indicator
    const indicatorPosition = useRef(new Animated.Value(0)).current;
    const screenWidth = Dimensions.get('window').width;
    const tabContainerWidth = screenWidth - 40;
    const indicatorWidth = tabContainerWidth / 2;

    // State for Followers (Readers)
    const [readersData, setReadersData] = useState<UserData[]>([]);
    const [readersIndex, setReadersIndex] = useState(0);
    const [readersLoading, setReadersLoading] = useState(false);
    const [isReadersEnd, setIsReadersEnd] = useState(false);
    const [readersRefreshing, setReadersRefreshing] = useState(false);

    // State for Following
    const [followsData, setFollowsData] = useState<UserData[]>([]);
    const [followsIndex, setFollowsIndex] = useState(0);
    const [followsLoading, setFollowsLoading] = useState(false);
    const [isFollowsEnd, setIsFollowsEnd] = useState(false);
    const [followsRefreshing, setFollowsRefreshing] = useState(false);

    useFocusEffect(
        useCallback(() => {
            setActiveTab(activeTab || 'Readers');
        }, [activeTab])
    )
    // Fetch Readers
    const fetchReaders = async (isRefresh = false) => {
        if (readersLoading || (!isRefresh && isReadersEnd)) return;
        setReadersLoading(true);
        const currentIndex = isRefresh ? 0 : readersIndex;
        try {
            const data = await getReaders(Number(userId), currentIndex);
            console.log(data)
            if (data.end) {
                setIsReadersEnd(true);
            } else {
                setReadersData(prev => isRefresh ? data.data : [...prev, ...data.data.filter((item: any) => !prev.some(existing => existing.user_id === item.user_id))]);
                setReadersIndex(prev => prev + 12);
            }
        } catch (error) {
            console.error("Failed to fetch readers:", error);
        } finally {
            setReadersLoading(false);
            if (isRefresh) setReadersRefreshing(false);
        }
    };

    // Fetch Follows
    const fetchFollows = async (isRefresh = false) => {
        if (followsLoading || (!isRefresh && isFollowsEnd)) return;
        setFollowsLoading(true);
        const currentIndex = isRefresh ? 0 : followsIndex;
        try {
            const data = await getFollows(Number(userId), currentIndex);
            if (data.end) {
                setIsFollowsEnd(true);
            } else {
                setFollowsData(prev => isRefresh ? data.data : [...prev, ...data.data.filter((item: any) => !prev.some(existing => existing.user_id === item.user_id))]);
                setFollowsIndex(prev => prev + 12);
            }
        } catch (error) {
            console.error("Failed to fetch follows:", error);
        } finally {
            setFollowsLoading(false);
            if (isRefresh) setFollowsRefreshing(false);
        }
    };

    // Pull to Refresh Handler
    const onRefresh = () => {
        if (activeTabState === 'Readers') {
            setReadersRefreshing(true);
            setReadersData([]);
            setReadersIndex(0);
            setIsReadersEnd(false);
            fetchReaders(true);
        } else {
            setFollowsRefreshing(true);
            setFollowsData([]);
            setFollowsIndex(0);
            setIsFollowsEnd(false);
            fetchFollows(true);
        }
    };

    useEffect(() => {
        // Fetch initial data for both tabs when userId changes
        if (userId) {
            fetchReaders(true); // Fetch fresh data on user change
            fetchFollows(true); // Fetch fresh data on user change
        }
    }, [userId]);

    useEffect(() => {
        // Reset indices and end flags when switching tabs
        if (activeTabState === 'Readers' && readersData.length === 0) {
            fetchReaders(true);
        } else if (activeTabState === 'Follows' && followsData.length === 0) {
            fetchFollows(true);
        }
    }, [activeTabState]);
    useEffect(() => {
        Animated.spring(indicatorPosition, {
            toValue: activeTabState === 'Readers' ? 0 : indicatorWidth,
            useNativeDriver: false,
        }).start();
    }, [activeTabState, indicatorWidth]);

    const renderUserItem = ({ item }: { item: UserData }) => (
        <View style={styles.userItem}>
            <FastImage style={styles.avatarPlaceholder} source={{uri: `${GetApiUrl().slice(0, 25)}/media/${item.avatar}`}} />
            <Text style={styles.userName}>{item.username}</Text>
            <TouchableOpacity style={styles.followButton}>
                <Text style={styles.followButtonText}>Follow</Text>
            </TouchableOpacity>
        </View>
    );

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0A0410' : '#F5F5F7',
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 20,
            paddingBottom: 10,
        },
        backButton: {
            marginRight: 15,
        },
        nickname: {
            fontSize: 22,
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : '#000',
        },
        tabWrapper: {
            paddingHorizontal: 20,
            marginTop: 10,
        },
        tabContainer: {
            flexDirection: 'row',
        },
        tabButton: {
            width: '50%',
            paddingVertical: 12,
            alignItems: 'center',
        },
        tabButtonText: {
            fontSize: 16,
            fontWeight: '600',
        },
        indicator: {
            height: 3,
            backgroundColor: isDark ? '#A78BFA' : '#5856D6',
            borderRadius: 1.5,
        },
        tabIndicatorContainer: {
            height: 3,
            backgroundColor: isDark ? '#180F2E' : '#E0E0E0',
        },
        contentContainer: {
            flex: 1,
        },
        userItem: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 20,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#180F2E' : '#E0E0E0',
        },
        avatarPlaceholder: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isDark ? '#180F2E' : '#E0E0E0',
            marginRight: 12,
        },
        userName: {
            flex: 1,
            fontSize: 16,
            fontWeight: '500',
            color: isDark ? '#FFFFFF' : '#000',
        },
        followButton: {
            backgroundColor: isDark ? '#A78BFA' : '#5856D6',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
        },
        followButtonText: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        footerLoader: {
            paddingVertical: 20,
        }
    });

    return (
        <View style={styles.container}>
            <StatusBar 
                backgroundColor={isDark ? '#0A0410' : '#F5F5F7'}
                barStyle={isDark ? "light-content" : "dark-content"}
            />
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color={isDark ? '#FFFFFF' : '#000'} />
                </TouchableOpacity>
                <Text style={styles.nickname}>{username || 'Profile'}</Text>
            </View>

            <View style={styles.tabWrapper}>
                <View style={styles.tabContainer}>
                    <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('Readers')}>
                        <Text style={[styles.tabButtonText, { color: activeTab === 'Readers' ? (isDark ? '#FFFFFF' : '#000000') : '#A09CB8' }]}>
                            Readers
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('Follows')}>
                        <Text style={[styles.tabButtonText, { color: activeTab === 'Follows' ? (isDark ? '#FFFFFF' : '#000000') : '#A09CB8' }]}>
                            Following
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.tabIndicatorContainer}>
                    <Animated.View style={[styles.indicator, { left: indicatorPosition, width: indicatorWidth }]} />
                </View>
            </View>

            <View style={styles.contentContainer}>
                {activeTabState === 'Readers' ? (
                    <FlatList
                        data={readersData}
                        renderItem={renderUserItem}
                        keyExtractor={item => item.user_id.toString()}
                        onEndReached={() => fetchReaders()}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={readersLoading && !readersRefreshing ? <ActivityIndicator style={styles.footerLoader} size="large" color={isDark ? '#A78BFA' : '#5856D6'} /> : null}
                        refreshControl={
                            <RefreshControl 
                                refreshing={readersRefreshing} 
                                onRefresh={onRefresh}
                                tintColor={isDark ? '#FFFFFF' : '#000'}
                            />
                        }
                    />
                ) : (
                    <FlatList
                        data={followsData}
                        renderItem={renderUserItem}
                        keyExtractor={item => item.user_id.toString()}
                        onEndReached={() => fetchFollows()}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={followsLoading && !followsRefreshing ? <ActivityIndicator style={styles.footerLoader} size="large" color={isDark ? '#A78BFA' : '#5856D6'} /> : null}
                        refreshControl={
                            <RefreshControl 
                                refreshing={followsRefreshing} 
                                onRefresh={onRefresh}
                                tintColor={isDark ? '#FFFFFF' : '#000'}
                            />
                        }
                    />
                )}
            </View>
        </View>
    );
}
