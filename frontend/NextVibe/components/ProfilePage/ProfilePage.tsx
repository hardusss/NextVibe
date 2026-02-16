import { useState, useCallback, useEffect } from "react";
import { View, SafeAreaView, Text, StatusBar, Modal, ScrollView, TouchableOpacity, RefreshControl, Animated, Easing, Linking } from "react-native";
import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";
import { useColorScheme } from 'react-native';
import getUserDetail from "@/src/api/user.detail";
import { MaterialIcons } from '@expo/vector-icons';
import formatNumber from "@/src/utils/formatNumber";
import ButtonSettings from "./ButtonSettings";
import ButtonWallet from "./ButtonWallet";
import PostGallery from "./PostsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { useFocusEffect } from 'expo-router';
import { storage } from '@/src/utils/storage';
import { useRef } from "react";
import FastImage from 'react-native-fast-image';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import Hyperlink from 'react-native-hyperlink';
import VerifyBadge from "../VerifyBadge";
import { ShareViaNFC } from "./ShareViaNFC/ButtonShare";
import ShareModal, { ShareModalRef } from './ShareViaNFC/ShareBottomModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";


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
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const [visible, setVisible] = useState<boolean>(false);
    const [isVisibleContainer, setIsVisibleContainer] = useState<boolean>(false);
    const [showVerifiedToast, setShowVerifiedToast] = useState(false);
    const [id, setId] = useState<number>();
    const lottieRef = useRef<LottieView>(null);
    const scaleAnimToast = useRef(new Animated.Value(0)).current;
    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;
    const router = useRouter();
    
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

    const fetchUserData = async () => {
        try {
            const data = await getUserDetail(0);
            setUserData({
                username: data?.username || "",
                about: data?.about || "",
                avatar_url: data?.avatar ? `${data.avatar}` : null,
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
        const id = await storage.getItem("id");
        setId(parseInt(id as string));
    }
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setRefreshKey(prev => prev + 1); // Increment refresh key to force re-render
        setRefreshing(false);
        fetchUserData();
    }, []);

    const modalRef = useRef<ShareModalRef>(null);

    // Func for open bottom sheet for share profile via nfc
    const handleOpenModal = () => {
        modalRef.current?.present();
    };

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
    );

    useEffect(() => {
        if (showVerifiedToast) {
            Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 4,      
            tension: 150,     
            useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(scaleAnim, {
            toValue: 0,
            duration: 400,      
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
            }).start();
        }
        }, [showVerifiedToast]);

    return (
        <SafeAreaView style={profileStyle.container}>
            <StatusBar
                animated={true}
                backgroundColor={colorScheme === 'dark' ? '#0A0410' : '#f0f0f0'} 
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
                    <Modal transparent visible={isVisibleContainer} animationType="fade">
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
                    <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
                        <View style={{flexDirection: "row", alignItems: "center"}}>
                            <Text style={profileStyle.username}>{userData.username}</Text>
                            {userData.official ? (
                                <VerifyBadge isLooped={true} isVisible={true} haveModal={true} isStatic={false} size={24}/>
                            ) : null}
                        </View>
                        <View style={{flexDirection: "row", alignItems: "center"}}>
                            <ButtonWallet />
                            <ButtonSettings />
                        </View>
                    </View>
                    


                    <View style={{flexDirection: "row", marginTop: 20, marginLeft: -5}}>
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => setVisible(true)}>
                            <FastImage style={profileStyle.avatar} source={{ uri: userData.avatar_url as string}} />
                        </TouchableOpacity>
                        <View style={{flexDirection: "row", marginTop: 35, marginLeft: 20, flex: 1, justifyContent: "space-around"}}>
                            <View >
                                <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.post_count)}</Text>
                                <Text style={profileStyle.text}>Posts</Text>
                            </View>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push({ pathname: "/follows-screen", params: {last_page: "/profile",  userId: id, username: userData.username, activeTab: "Readers" } })}>
                                <View>
                                    <Text style={[profileStyle.text, {fontWeight: "bold"}]}>{formatNumber(userData.readers_count)}</Text>
                                    <Text style={profileStyle.text}>Readers</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Follows" } })}>
                                <View>
                                    <Text style={[profileStyle.text, {fontWeight: "bold"}]} >{formatNumber(userData.follows_count)}</Text>
                                    <Text style={profileStyle.text}>Follows</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View>
                        {userData.about !== "" ? 
                        <Hyperlink
                            linkStyle={{ color: "#A78BFA", fontWeight: "500" }}
                            onPress={(url: string) => Linking.openURL(url)}
                        >
                            <Text style={profileStyle.about}>{userData.about}</Text> 
                        </Hyperlink>
                        
                        : ""}
                    </View>
                    <ShareViaNFC handlePress={handleOpenModal}/>
                    <ShareModal ref={modalRef} avatarUrl={userData.avatar_url}/>

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
