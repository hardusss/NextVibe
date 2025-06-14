import { useState, useCallback, useEffect } from "react";
import { View, SafeAreaView, Text, StatusBar, Image, ScrollView, RefreshControl } from "react-native";
import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";
import { useColorScheme } from 'react-native';
import getUserDetail from "@/src/api/user.detail";
import GetApiUrl from "@/src/utils/url_api";
import { MaterialIcons } from '@expo/vector-icons';
import formatNumber from "@/src/utils/formatNumber";
import ButtonSettings from "./ButtonSettings";
import ButtonWallet from "./ButtonWallet";
import RecommendedUsers from "./recommendateProfiles";
import PostGallery from "./PostsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { useFocusEffect } from 'expo-router';
import AsyncStorage from "@react-native-async-storage/async-storage";

import FastImage from 'react-native-fast-image';


type UserData = {
    username: string;
    about: string;
    avatar_url: string | null;
    post_count: number;
    readers_count: number;
    follows_count: number;
    official: boolean
};

const ProfileView = () => {
    const [userData, setUserData] = useState<UserData>({
        username: "",
        about: "",
        avatar_url: null,
        post_count: 0,
        readers_count: 0,
        follows_count: 0,
        official: false
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0); // Add refresh key state
    const [id, setId] = useState<number>();
    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;

    useEffect(() => {
        const func = async () => {
           const i =  await AsyncStorage.getItem("id");
           const t = await AsyncStorage.getItem("access");
           console.log(i, t)
        }
        func()
    })
    const fetchUserData = async () => {
        try {
            const data = await getUserDetail(0);
            setUserData({
                username: data?.username || "",
                about: data?.about || "",
                avatar_url: data?.avatar ? `${GetApiUrl().slice(0, 25)}${data.avatar}` : null,
                post_count: data?.post_count || 0,
                readers_count: data?.readers_count || 0,
                follows_count: data?.follows_count || 0,
                official: true ? data.official === true : false
            });
        } catch (error) {
            console.error("Fetch error reboot page)", error);
        } finally {
            setLoading(false);
        }
    };

    const getId = async () => {
        const id = await AsyncStorage.getItem("id");
        setId(parseInt(id as string));
    }
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setRefreshKey(prev => prev + 1); // Increment refresh key to force re-render
        setRefreshing(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            getId();
            fetchUserData();
            setRefreshKey(prev => prev + 1); // Also increment on focus

            return () => {
                setUserData({
                    username: "",
                    about: "",
                    avatar_url: null,
                    post_count: 0,
                    readers_count: 0,
                    follows_count: 0,
                    official: false})
            }
        }, [])
    )

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
                    keyboardShouldPersistTaps="handled" 
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
                    <View style={{flexDirection: "row"}}>
                        <Text style={profileStyle.username}>{userData.username}</Text>
                        {userData.official ? <MaterialIcons name="check-circle" size={24} color="#58a6ff" style={{marginTop: 14}} /> :  ""}
                    </View>
                    <View style={{flexDirection: "row", marginTop: 20, marginLeft: -5}}>
                        <FastImage style={profileStyle.avatar} source={{ uri: userData.avatar_url as string}} />
                        <View style={{flexDirection: "row", marginTop: 35, marginLeft: 20, flex: 1, justifyContent: "space-around"}}>
                            <View >
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.post_count)}</Text>
                                <Text style={profileStyle.text}>Posts</Text>
                            </View>

                            <View>
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.readers_count)}</Text>
                                <Text style={profileStyle.text}>Readers</Text>
                            </View>

                            <View>
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]} >{formatNumber(userData.follows_count)}</Text>
                                <Text style={profileStyle.text}>Follows</Text>
                            </View>
                        </View>
                    </View>
                    <View>
                        {userData.about !== "" ? <Text style={profileStyle.about}>{userData.about}</Text> : ""}
                        
                    </View>
                    <View style={{flexDirection: "row", marginTop: 20, gap: "1.5%", justifyContent: "center", marginLeft: -15}}>
                        <ButtonSettings />
                        <ButtonWallet />
                    </View>

                    <RecommendedUsers key={`recommended-${refreshKey}`} />

                    {userData.post_count === 0 ? 
                        <View style={{borderTopWidth: 1, borderColor: "#5A31F4", marginTop: 20}}>
                            <MaterialIcons name="camera-alt" size={60} color="#58a6ff" style={{ marginTop: 14, alignSelf: "center" }} />
                            <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10, color: colorScheme === "dark" ? "#fff" : "black", alignSelf: "center" }}>
                                No Posts Yet
                            </Text>
                            <Text style={{ fontSize: 16, color: "#666", textAlign: "center", marginBottom: 20 }}>
                                Start sharing your moments to make your profile more engaging.
                            </Text>
                        </View> 
                        : 
                        <PostGallery key={`posts-${refreshKey}`} id={id as number} previous="profile"/>
                    }
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

export default ProfileView;
