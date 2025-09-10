import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, StatusBar, Animated, FlatList, Dimensions, RefreshControl, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect, RelativePathString } from "expo-router";
import getFollows from '@/src/api/get.follows'; 
import getReaders from '@/src/api/get.readers'; 
import FastImage from 'react-native-fast-image';
import GetApiUrl from '@/src/utils/url_api';
import CreateChat from '@/src/api/create.chat';

type UserData = {
    user_id: number;
    username: string;
    avatar: string | null;
}

export default function FollowsScreen() {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    
    // Get params from route
    const { activeTab, userId, username } = useLocalSearchParams();
    
    // Tab State and Page state
    const [activeTabState, setActiveTabState] = useState(activeTab || 'Readers')
    
    // Animated Indicator
    const indicatorPosition = useRef(new Animated.Value(0)).current;
    const screenWidth = Dimensions.get('window').width;
    const tabContainerWidth = screenWidth - 40;
    const indicatorWidth = tabContainerWidth / 2;
    
    // State for Readers
    const [readersData, setReadersData] = useState<UserData[]>([]);
    const [readersIndex, setReadersIndex] = useState(0);
    const [readersLoading, setReadersLoading] = useState(false);
    const [isReadersEnd, setIsReadersEnd] = useState(false);
    const [readersRefreshing, setReadersRefreshing] = useState(false);
    const [readersInitialized, setReadersInitialized] = useState(false);
    
    // State for Following
    const [followsData, setFollowsData] = useState<UserData[]>([]);
    const [followsIndex, setFollowsIndex] = useState(0);
    const [followsLoading, setFollowsLoading] = useState(false);
    const [isFollowsEnd, setIsFollowsEnd] = useState(false);
    const [followsRefreshing, setFollowsRefreshing] = useState(false);
    const [followsInitialized, setFollowsInitialized] = useState(false);
    
    // Reset all data when userId changes
    const resetAllData = useCallback(() => {
        setReadersData([]);
        setFollowsData([]);
        setReadersIndex(0);
        setFollowsIndex(0);
        setIsReadersEnd(false);
        setIsFollowsEnd(false);
        setReadersInitialized(false);
        setFollowsInitialized(false);
    }, [userId]);
    
    // Set active tab when component mounts or activeTab changes    
    useFocusEffect(
        useCallback(() => {
            setActiveTabState(activeTab || 'Readers');
        }, [activeTab])
    );
    
    // Reset data when userId changes
    useFocusEffect(
        useCallback(() => {
            resetAllData();
        }, [resetAllData])
    );

    // Handle Message Button Press
    const handleCreateChat = async (user_id: number) => {
        try {
            const response = await CreateChat(user_id); // Assuming CreateChat returns the new chat ID

            if (response?.data) {
                router.push({
                    pathname: "/(tabs)/chat-room",
                    params: { id: response.data.chat_id, userId: user_id }
                });
            }
        
        // Handle errors
        } catch (error: any) {

            const errResponse = error.response?.data;
            const status = error.response?.status;

            if (errResponse?.error === "Chat already exists" && status === 400) {
                router.push({
                    pathname: "/(tabs)/chat-room",
                    params: { id: errResponse.existing_chat_id, userId: user_id }
                });
            }
        }
    };


    
    // Fetch Readers
    const fetchReaders = useCallback(async (isRefresh = false) => {
        if (readersLoading || (!isRefresh && isReadersEnd)) return;
        
        setReadersLoading(true);
        const currentIndex = isRefresh ? 0 : readersIndex;
        
        try {
            const data = await getReaders(Number(userId), currentIndex);
            
            if (data.end) {
                setIsReadersEnd(true);
            }
            
            if (isRefresh) {
                setReadersData(data.data || []);
                setReadersIndex((data.data || []).length);
                setReadersInitialized(true);
            } else {
                // Filter duplicates
                const newItems = (data.data || []).filter((item: UserData) => 
                    !readersData.some(existing => existing.user_id === item.user_id)
                );
                setReadersData(prev => [...prev, ...newItems]);
                setReadersIndex(prev => {
                    const newIndex = prev + newItems.length;
                    return newIndex;
                });
            }
        } catch (error) {
            console.error("Failed to fetch readers:", error);
        } finally {
            setReadersLoading(false);
            if (isRefresh) setReadersRefreshing(false);
        }
    }, [readersLoading, isReadersEnd, readersIndex, readersData, userId]);
    
    // Fetch Follows
    const fetchFollows = useCallback(async (isRefresh = false) => {
        if (followsLoading || (!isRefresh && isFollowsEnd)) return;
        
        setFollowsLoading(true);
        const currentIndex = isRefresh ? 0 : followsIndex;
        
        try {
            const data = await getFollows(Number(userId), currentIndex);
            
            if (data.end) {
                setIsFollowsEnd(true);
            }
            
            if (isRefresh) {
                setFollowsData(data.data || []);
                setFollowsIndex((data.data || []).length);
                setFollowsInitialized(true);
            } else {
                // Filter duplicates
                const newItems = (data.data || []).filter((item: UserData) => 
                    !followsData.some(existing => existing.user_id === item.user_id)
                );
                setFollowsData(prev => [...prev, ...newItems]);
                setFollowsIndex(prev => {
                    const newIndex = prev + newItems.length;
                    return newIndex;
                });
            }
        } catch (error) {
            console.error("Failed to fetch follows:", error);
        } finally {
            setFollowsLoading(false);
            if (isRefresh) setFollowsRefreshing(false);
        }
    }, [followsLoading, isFollowsEnd, followsIndex, followsData, userId]);
    
    // Pull to Refresh Handler
    const onRefresh = useCallback(() => {
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
    }, [activeTabState, fetchReaders, fetchFollows]);
    
    // Load initial data when screen becomes focused
    useEffect(() => {
        if (userId && activeTabState === 'Readers' && !readersInitialized && !readersLoading) {
            fetchReaders(true);
        }
    }, [userId, activeTabState, readersInitialized, readersLoading, fetchReaders]);
    
    useEffect(() => {
        if (userId && activeTabState === 'Follows' && !followsInitialized && !followsLoading) {
            fetchFollows(true);
        }
    }, [userId, activeTabState, followsInitialized, followsLoading, fetchFollows]);
    
    // Load data when switching tabs
    useEffect(() => {
        if (activeTabState === 'Readers' && !readersInitialized && !readersLoading) {
            fetchReaders(true);
        } else if (activeTabState === 'Follows' && !followsInitialized && !followsLoading) {
            fetchFollows(true);
        }
    }, [activeTabState, readersInitialized, followsInitialized, readersLoading, followsLoading, fetchReaders, fetchFollows]);
    
    // Animated indicator
    useEffect(() => {
        Animated.spring(indicatorPosition, {
            toValue: activeTabState === 'Readers' ? 0 : indicatorWidth,
            useNativeDriver: false,
        }).start();
    }, [activeTabState, indicatorWidth]);
    
    // Load more functions
    const loadMoreReaders = useCallback(() => {
        if (!readersLoading && !isReadersEnd && readersInitialized) {
            fetchReaders();
        }
    }, [readersLoading, isReadersEnd, readersInitialized, fetchReaders]);
    
    const loadMoreFollows = useCallback(() => {
        if (!followsLoading && !isFollowsEnd && followsInitialized) {
            fetchFollows();
        }
    }, [followsLoading, isFollowsEnd, followsInitialized, fetchFollows]);
    
    const renderUserItem = ({ item }: { item: UserData }) => (
        <TouchableOpacity style={styles.userItem}  onPress={() => router.push({ pathname: "/user-profile", params: { id: item.user_id, last_page: `/follows-screen?userId=${userId}` } })}>
            <FastImage 
                style={styles.avatarPlaceholder} 
                source={{
                    uri: item.avatar ? `${GetApiUrl().slice(0, 26)}/media/${item.avatar}` : undefined
                }} 
            />
            <Text style={styles.userName}>{item.username}</Text>
            <TouchableOpacity style={styles.messageButton} onPress={() => handleCreateChat(item.user_id)}>
                <Text style={styles.messageButtonText}>Message</Text>
            </TouchableOpacity>
        </TouchableOpacity>
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
        messageButton: {
            backgroundColor: isDark ? '#A78BFA' : '#5856D6',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
        },
        messageButtonText: {
            color: isDark ? '#0A0410' : '#F5F5F7',
            fontWeight: '500',
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
                    <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTabState('Readers')}>
                        <Text style={[styles.tabButtonText, { 
                            color: activeTabState === 'Readers' ? (isDark ? '#FFFFFF' : '#000000') : '#A09CB8' 
                        }]}>
                            Readers
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTabState('Follows')}>
                        <Text style={[styles.tabButtonText, { 
                            color: activeTabState === 'Follows' ? (isDark ? '#FFFFFF' : '#000000') : '#A09CB8' 
                        }]}>
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
                        onEndReached={loadMoreReaders}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={
                            readersLoading && !readersRefreshing ? 
                            <ActivityIndicator style={styles.footerLoader} size="large" color={isDark ? '#A78BFA' : '#5856D6'} /> 
                            : null
                        }
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
                        onEndReached={loadMoreFollows}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={
                            followsLoading && !followsRefreshing ? 
                            <ActivityIndicator style={styles.footerLoader} size="large" color={isDark ? '#A78BFA' : '#5856D6'} /> 
                            : null
                        }
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