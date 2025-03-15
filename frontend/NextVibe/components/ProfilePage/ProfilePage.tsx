import { useState, useEffect } from "react";
import { View, SafeAreaView, Text, StatusBar, Image, ScrollView } from "react-native";
import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";
import { useColorScheme } from 'react-native';
import getUserDetail from "@/src/api/user.detail";
import GetApiUrl from "@/src/utils/url_api";
import { MaterialIcons } from '@expo/vector-icons';
import formatNumber from "@/src/utils/formatNumber";
import ButtonSettings from "./ButtonSettings";
import ButtonWallet from "./ButtomWallet";
import RecommendedUsers from "./recommendateProfiles";
import PostGallery from "./PostsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

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
    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;

    const fetchUserData = async () => {
        try {
            const data = await getUserDetail();
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
                <ScrollView contentContainerStyle={{ paddingBottom: 20 }} 
                keyboardShouldPersistTaps="handled" 
                showsVerticalScrollIndicator={false} >
                    <View style={{flexDirection: "row"}}>
                        <Text style={profileStyle.username}>{userData.username}</Text>
                        {userData.official ? <MaterialIcons name="check-circle" size={24} color="#58a6ff" style={{marginTop: 14}} /> :  ""}
                    </View>
                    <View style={{flexDirection: "row", marginTop: 20, marginLeft: -5}}>
                        <Image style={profileStyle.avatar} source={{ uri: userData.avatar_url as string}} />
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

                    <RecommendedUsers />

                    {userData.post_count === 0 ? 
                        <View style={{borderTopWidth: 1, borderColor: "#5A31F4", marginTop: 20}}>
                            <MaterialIcons name="camera-alt" size={60} color="#58a6ff" style={{ marginTop: 14, alignSelf: "center" }} />
                            <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10, color: "white", alignSelf: "center" }}>
                                No Posts Yet
                            </Text>
                            <Text style={{ fontSize: 16, color: "#666", textAlign: "center", marginBottom: 20 }}>
                                Start sharing your moments to make your profile more engaging.
                            </Text>
                        </View> : <PostGallery />}
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

export default ProfileView;
