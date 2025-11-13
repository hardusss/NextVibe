import { useState, useCallback, useRef, useEffect } from "react";
import { View, SafeAreaView, Text, StatusBar,Modal, ScrollView, RefreshControl, TouchableOpacity, Animated } from "react-native";
import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";
import { useColorScheme } from 'react-native';
import GetApiUrl from "@/src/utils/url_api";
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import formatNumber from "@/src/utils/formatNumber";
import PostGallery from "./PostsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { useFocusEffect } from 'expo-router';
import getUserDetail from "@/src/api/user.detail";
import followUser from "@/src/api/follow";
import CreateChat from "@/src/api/create.chat";
import FastImage from 'react-native-fast-image';
import RecommendedUsers from "./recommendateProfiles";

type UserData = {
    user_id: number;
    username: string;
    about: string;
    avatar_url: string | null;
    post_count: number;
    readers_count: number;
    follows_count: number;
    official: boolean;
    is_subscribed: boolean;
};

const ButtonSubscribe = ({ isSubscribed, onPress, isDark }: { isSubscribed: boolean, onPress: () => void, isDark: boolean }) => (
    <TouchableOpacity 
        style={{
            backgroundColor: isSubscribed ? '#2a1a35ff'  : '#400666ff' ,
            padding: 10,
            borderRadius: 8,
            width: '48%',
            borderWidth: 1,
            borderColor: '#2a1a35ff',
        }}
        onPress={onPress}
    >
        <Text style={{ 
            color: 'white',
            textAlign: 'center',
            fontWeight: 'bold'
        }}>
            {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        </Text>
    </TouchableOpacity>
);

const ButtonMessage = ({user, isDark}: {user: UserData, isDark: boolean}) => {
    const router = useRouter();

    const handleCreateChat = async () => {
    
        try {
            const response = await CreateChat(user.user_id);
            if (response) {
                router.push({
                    pathname: "/(tabs)/chat-room",
                    params: { id: response.chat_id, userId: user.user_id }
                });
            }
        } catch (error: any) {
            const errResponse = error.response?.data;
            const status = error.response?.status;

            if (errResponse?.error === "Chat already exists" && status === 400) {
                router.push({
                    pathname: "/(tabs)/chat-room",
                    params: { id: errResponse.existing_chat_id, userId: user.user_id }
                });
            }
        }
    
    }
    return (
        <TouchableOpacity 
            style={{
                backgroundColor:  isDark ? '#0A0410' : '#fff',
                padding: 10,
                borderRadius: 8,
                width: '48%',
                borderWidth: 1,
                borderColor: '#62218eff',
                }}
                onPress={() => {handleCreateChat()}}
        >
            <Text style={{ 
                color: '#8d11e0ff',
                textAlign: 'center',
                fontWeight: 'bold'
            }}>
                Message
            </Text>
        </TouchableOpacity>
    );
};

const UserProfileView = () => {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [userData, setUserData] = useState<UserData>({
        user_id: 0,
        username: "",
        about: "",
        avatar_url: null,
        post_count: 0,
        readers_count: 0,
        follows_count: 0,
        official: false,
        is_subscribed: false
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [visible, setVisible] = useState<boolean>(false);
    const [isVisibleContainer, setIsVisibleContainer] = useState<boolean>(false);
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;

    const fetchUserData = async () => {
        try {
            const data = await getUserDetail(+id, true); // Using the imported getUserDetail
            setUserData({
                user_id: data?.user_id || 0,
                username: data?.username || "",
                about: data?.about || "",
                avatar_url: data?.avatar ? `${GetApiUrl().slice(0, 26)}${data.avatar}` : null,
                post_count: data?.post_count || 0,
                readers_count: data?.readers_count || 0,
                follows_count: data?.follows_count || 0,
                official: data?.official || false,
                is_subscribed: data?.is_subscribed || false
            });
        } catch (error) {
            console.error("Failed to fetch user data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubscribe = async () => {
        followUser(+id)
        setUserData(prev => ({
            ...prev,
            is_subscribed: !prev.is_subscribed,
            readers_count: prev.is_subscribed ? prev.readers_count - 1 : prev.readers_count + 1
        }));
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchUserData();
        setRefreshKey(prev => prev + 1);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        if (visible) {
          setIsVisibleContainer(true);
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 10,
            bounciness: 8,
          }).start();
        } else {
          Animated.timing(scaleAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
          setTimeout(() => {setIsVisibleContainer(false)}, 200);
        };
    }, [visible]);

    useFocusEffect(
        useCallback(() => {
            fetchUserData();
            return () => {
                setUserData({
                    user_id: 0,
                    username: "",
                    about: "",
                    avatar_url: null,
                    post_count: 0,
                    readers_count: 0,
                    follows_count: 0,
                    official: false,
                    is_subscribed: false
                });
            }
        }, [id])
    );

    return (
        <SafeAreaView style={[profileStyle.container, {overflow: "hidden"}]}>
            <StatusBar
                animated={true}
                backgroundColor={colorScheme === 'dark' ? '#0A0410' : '#f0f0f0'} 
            />
            
            {loading ? (
                <ActivityIndicator size="large" color="#58a6ff" style={{flex: 1, justifyContent: "center", alignItems: "center"}}/>
            ) : (
                <ScrollView 
                    contentContainerStyle={{ paddingBottom: 20, overflow: "hidden"}} 
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colorScheme === 'dark' ? "#fff" : "#000"}
                            colors={["#58a6ff"]}
                            progressBackgroundColor={colorScheme === 'dark' ? "#000" : "#fff"}
                        />
                    }
                >
                    <Modal transparent visible={isVisibleContainer} animationType="fade">
                        <TouchableOpacity
                            style={{flex: 1,
                                    justifyContent: "center",
                                    alignItems: "center",
                                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                                }}
                            activeOpacity={1}
                            onPress={() => setVisible(false)}
                        >
                            <Animated.View style={[{ backgroundColor: "transparent",
                                                     justifyContent: "center",
                                                     alignItems: "center",},
                                                     { transform: [{ scale: scaleAnim }] }]}>
                            <FastImage
                                style={{ width: 200, height: 200, borderRadius: 100 }}
                                source={{ uri: userData.avatar_url as string }}
                            />
                            </Animated.View>
                        </TouchableOpacity>
                    </Modal>
                    {/* User Info Section */}
                    <View style={{flexDirection: "row", alignItems: "center"}}>
                        <TouchableOpacity 
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingRight: 10
                            }}
                            onPress={() => router.back()}
                        >
                            <MaterialIcons 
                                name="arrow-back" 
                                size={32} 
                                color={colorScheme === 'dark' ? '#fff' : '#000'}
                            />
                        </TouchableOpacity>

                        <Text style={[profileStyle.username]}>{userData.username}</Text>
                        {userData.official && <MaterialIcons name="check-circle" size={24} color="#58a6ff" style={{ marginLeft: 2}} />}
                    </View>

                    {/* Stats Section */}
                    <View style={{flexDirection: "row", marginTop: 20, marginLeft: -5}}>
                        <TouchableOpacity onPress={() => setVisible(true)}>
                            <FastImage style={profileStyle.avatar} source={{ uri: userData.avatar_url as string}} />
                        </TouchableOpacity>
                        <View style={{flexDirection: "row", marginTop: 35, marginLeft: 20, flex: 1, justifyContent: "space-around"}}>
                            <View >
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.post_count)}</Text>
                                <Text style={profileStyle.text}>Posts</Text>
                            </View>
                            <TouchableOpacity onPress={() => router.push({ pathname: "/follows-screen", params: {  userId: id, username: userData.username, activeTab: "Readers" } })}>
                                <View>
                                    <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.readers_count)}</Text>
                                    <Text style={profileStyle.text}>Readers</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push({ pathname: "/follows-screen", params: { userId: id, username: userData.username, activeTab: "Follows" } })}>
                                <View>
                                    <Text style={[profileStyle.text, {fontWeight: "bold"}]} >{formatNumber(userData.follows_count)}</Text>
                                    <Text style={profileStyle.text}>Follows</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* About Section */}
                    {userData.about && <Text style={[profileStyle.about, {}]}>{userData.about}</Text>}

                    {/* Action Buttons */}
                    <View style={{
                        flexDirection: "row",
                        marginTop: 20,
                        justifyContent: "space-between",
                    }}>
                        <ButtonSubscribe 
                            isSubscribed={userData.is_subscribed} 
                            onPress={handleSubscribe}
                            isDark={colorScheme === 'dark'} 
                        />
                        <ButtonMessage user={userData} isDark={colorScheme === 'dark'} />
                    </View>
                    <RecommendedUsers key={`recommended-${refreshKey}`} />
                    {+userData.post_count < 1 ? (
                        <View style={{borderTopWidth: 1, borderColor: "#5A31F4", marginTop: 20}}>
                            <MaterialIcons name="camera-alt" size={60} color="#58a6ff" style={{ marginTop: 14, alignSelf: "center" }} />
                            <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10, color: colorScheme === "dark" ? "#fff" : "black", alignSelf: "center" }}>
                                No Posts Yet
                            </Text>
                        </View>
                    ) : (
                        <PostGallery key={`posts-${refreshKey}`} id={+id} previous={"user-profile"}/>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

export default UserProfileView;
