import { useState } from "react";
import { FlatList, View, TextInput, Text, StyleSheet, useColorScheme, TouchableOpacity, Dimensions, StatusBar } from "react-native";
import searchByName from "@/src/api/search";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { X, Search } from "lucide-react-native";
import formatNumber from "@/src/utils/formatNumber";
import { setSearchHistory, getSearchHistory, deleteUserFromHistory } from "@/src/api/history.search";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from 'expo-blur';
import { storage } from "@/src/utils/storage";
import VerifyBadge from "../VerifyBadge";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";
const { width } = Dimensions.get("window");
import { useRouter, useNavigation } from "expo-router";
import { StaggeredItem } from "@/components/Shared/motion";
import { useEffect } from "react";

const darkColors = {
    background: '#0A0410',
    cardBackground: '#0a0c1a',
    inputBackground: '#1B2842',
    primary: '#58a6ff',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#D9D9D9',
    border: '#05f0d8',
    shadow: '#0917b3',
};

const lightColors = {
    background: '#FAFAFC',
    cardBackground: '#ffffff',
    inputBackground: '#ffffff',
    primary: '#7c3aed',
    secondary: '#6d28d9',
    textPrimary: '#1a1025',
    textSecondary: '#6b5f7a',
    border: '#ebe8f0',
    shadow: 'rgba(124, 58, 237, 0.05)',
};

interface User {
    user_id: number;
    avatar: string;
    username: string;
    official: boolean;
    readers_count: number;
    is_og: boolean;
    og_edition: number | null;
    invited_count: number;
}

export default function SearchPage() {
    const colorScheme = useColorScheme();
    const colors = colorScheme === "dark" ? darkColors : lightColors;
    const router = useRouter();
    const navigation = useNavigation();
    const [searchName, setSearchName] = useState<string>("");

    useEffect(() => {
        navigation.setOptions({
            headerSearchBarOptions: {
                placeholder: "Search profiles...",
                onChangeText: (event: any) => {
                    setSearchName(event.nativeEvent.text);
                },
                onCancelButtonPress: () => {
                    setSearchName("");
                }
            }
        });
    }, [navigation]);
    const [users, setUsers] = useState<User[]>([]);
    const [notExist, setNotExist] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [searchHistoryUser, setSearchHistoryUser] = useState<User[]>([]);

    const fetchHistory = async () => {
        const response = await getSearchHistory();
        setSearchHistoryUser(response.data);
    };

    const checkUser = async (user_id: number) => {
        const id = await storage.getItem("id");
        return Number(id) == Number(user_id);
    };

    const handlePress = async (item: any) => {
        setSearchHistory(item.user_id);
        if (await checkUser(Number(item.user_id))) {
            router.push("/profile");
        } else {
            router.push({ pathname: "/user-profile", params: { id: item.user_id, last_page: "search" } });
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchHistory();
            return () => {
                setSearchName("");
                setUsers([]);
                setNotExist(false);
                setLoading(false);
                setSearchHistoryUser([]);
            };
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            if (searchName.length === 0) {
                setUsers([]);
                setNotExist(false);
                setLoading(false);
                fetchHistory();
            }
        }, [searchName])
    );

    useFocusEffect(
        useCallback(() => {
            if (searchName.length === 0) return;

            setLoading(true);
            const timeout = setTimeout(async () => {
                try {
                    const response = await searchByName(searchName);
                    const data: User[] = response.data;
                    if (typeof data === "string") {
                        setNotExist(true);
                        setUsers([]);
                        setLoading(false);
                        return;
                    }
                    setUsers(data.length ? data : []);
                    setNotExist(!data.length);
                } catch (error) {
                    console.error("Error searching users:", error);
                }
                setLoading(false);
            }, 1000);

            return () => clearTimeout(timeout);
        }, [searchName])
    );

    const handleDeleteUser = async (userId: number) => {
        await deleteUserFromHistory(userId);
        fetchHistory();
    };

    const renderUserRow = (item: User, index: number, showDelete = false) => (
        <StaggeredItem index={index}>
            <TouchableOpacity
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={[styles.userContainer, { borderBottomColor: colors.border, position: "relative" }]}
                onPress={() => handlePress(item)}
            >
                <AvatarWithFrame
                    avatarUrl={item.avatar}
                    size={40}
                    isOg={item.is_og}
                    ogEdition={item.og_edition}
                    invitedCount={item.invited_count}
                />
                <View style={{ marginLeft: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={[styles.username, { color: colors.textPrimary }]}>{item.username}</Text>
                        {item.official ? (
                            <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={16} />
                        ) : null}
                    </View>
                    <Text style={{ color: "gray", fontFamily: "Dank Mono Bold", includeFontPadding: false }}>
                        {formatNumber(item.readers_count)} Subs
                    </Text>
                </View>
                {showDelete && (
                    <TouchableOpacity
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        onPress={() => handleDeleteUser(item.user_id)}
                        style={{ position: "absolute", right: 10 }}
                    >
                        <X color={colors.textPrimary} size={24} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        </StaggeredItem>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            {/* History */}
            {!searchName.length && searchHistoryUser.length > 0 && (
                <FlatList
                    data={searchHistoryUser}
                    keyExtractor={(item) => item.user_id.toString()}
                    showsVerticalScrollIndicator={false}
                    contentInsetAdjustmentBehavior="automatic"
                    renderItem={({ item, index }) => renderUserRow(item, index, true)}
                />
            )}

            {/* Loading */}
            {loading && (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginTop: -70 }}>
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 10 }} />
                </View>
            )}

            {/* Search Results */}
            {!loading && !notExist ? (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.user_id.toString()}
                    showsVerticalScrollIndicator={false}
                    onEndReachedThreshold={0.5}
                    initialNumToRender={2}
                    contentInsetAdjustmentBehavior="automatic"
                    renderItem={({ item, index }) => renderUserRow(item, index, false)}
                />
            ) : (
                !loading && (
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginTop: -70 }}>
                        <Text style={{ fontSize: 24, color: colors.textPrimary }}>Users doesn't exist</Text>
                    </View>
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 0,
        paddingBottom: 80,
    },
    input: {
        height: 50,
        borderWidth: 0,
        borderTopRightRadius: 32,
        borderBottomRightRadius: 32,
        paddingHorizontal: 10,
        width: width - (35 + 50),
        fontSize: 16,
    },
    userContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingLeft: 10
    },
    username: {
        fontSize: 16,
    },
});