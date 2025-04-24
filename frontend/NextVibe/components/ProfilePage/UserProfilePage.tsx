import { useState, useCallback } from "react";
import { View, SafeAreaView, Text, StatusBar, Image, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
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
import { RelativePathString } from "expo-router";


type UserData = {
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
            backgroundColor: isSubscribed ? (isDark ? '#333' : '#fff') : (isDark ? '#000' : '#fff'),
            padding: 10,
            borderRadius: 8,
            width: '48%',
            borderWidth: 1,
            borderColor: '#00CED1',
        }}
        onPress={onPress}
    >
        <Text style={{ 
            color: '#00CED1',
            textAlign: 'center',
            fontWeight: 'bold'
        }}>
            {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        </Text>
    </TouchableOpacity>
);

const ButtonMessage = () => {
    const router = useRouter();
    return (
        <TouchableOpacity 
            style={{
                backgroundColor: '#00CED1',
                padding: 10,
                borderRadius: 8,
                width: '48%',
            }}
            onPress={() => {}}
        >
            <Text style={{ 
                color: '#fff', 
                textAlign: 'center',
                fontWeight: 'bold'
            }}>
                Message
            </Text>
        </TouchableOpacity>
    );
};

const UserProfileView = () => {
    const { id, last_page } = useLocalSearchParams();
    const router = useRouter();
    const [userData, setUserData] = useState<UserData>({
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
    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;

    const fetchUserData = async () => {
        try {
            const data = await getUserDetail(+id); // Using the imported getUserDetail
            setUserData({
                username: data?.username || "",
                about: data?.about || "",
                avatar_url: data?.avatar ? `${GetApiUrl().slice(0, 26)}${data.avatar}` : null,
                post_count: data?.post_count || 0,
                readers_count: data?.readers_count || 0,
                follows_count: data?.follows_count || 0,
                official: data?.official || false,
                is_subscribed: data?.is_subscribed || false
            });
            console.log("User data:", data);
        } catch (error) {
            console.error("Failed to fetch user data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubscribe = async () => {
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

    useFocusEffect(
        useCallback(() => {
            fetchUserData();
            return () => {
                setUserData({
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
        <SafeAreaView style={profileStyle.container}>
            <StatusBar
                animated={true}
                backgroundColor={colorScheme === 'dark' ? 'black' : '#f0f0f0'} 
            />
            
            {loading ? (
                <ActivityIndicator size="large" color="#58a6ff" style={{flex: 1, justifyContent: "center", alignItems: "center"}}/>
            ) : (
                <ScrollView 
                    contentContainerStyle={{ paddingBottom: 20 }} 
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
                    {/* User Info Section */}
                    <View style={{flexDirection: "row"}}>
                        <TouchableOpacity 
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: 10,
                            }}
                            onPress={() => router.push(last_page as RelativePathString || '/search')}
                        >
                            <MaterialIcons 
                                name="arrow-back" 
                                size={32} 
                                color={colorScheme === 'dark' ? '#fff' : '#000'}
                            />
                        </TouchableOpacity>

                        <Text style={profileStyle.username}>{userData.username}</Text>
                        {userData.official && <MaterialIcons name="check-circle" size={24} color="#58a6ff" style={{marginTop: 14}} />}
                    </View>

                    {/* Stats Section */}
                    <View style={{flexDirection: "row", marginTop: 20, marginLeft: -5}}>
                        <Image style={profileStyle.avatar} source={{ uri: userData.avatar_url as string}} />
                        <View style={{flexDirection: "row", marginTop: 35, marginLeft: 20, flex: 1, justifyContent: "space-around"}}>
                            {/* Stats items */}
                            <View>
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.post_count)}</Text>
                                <Text style={profileStyle.text}>Posts</Text>
                            </View>
                            <View>
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.readers_count)}</Text>
                                <Text style={profileStyle.text}>Readers</Text>
                            </View>
                            <View>
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.follows_count)}</Text>
                                <Text style={profileStyle.text}>Follows</Text>
                            </View>
                        </View>
                    </View>

                    {/* About Section */}
                    {userData.about && <Text style={[profileStyle.about, {marginLeft: 20}]}>{userData.about}</Text>}

                    {/* Action Buttons */}
                    <View style={{
                        flexDirection: "row",
                        marginTop: 20,
                        justifyContent: "space-between",
                        paddingHorizontal: 20,
                        marginBottom: 20
                    }}>
                        <ButtonSubscribe 
                            isSubscribed={userData.is_subscribed} 
                            onPress={handleSubscribe}
                            isDark={colorScheme === 'dark'} 
                        />
                        <ButtonMessage />
                    </View>
                    {userData.post_count === 0 ? (
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
