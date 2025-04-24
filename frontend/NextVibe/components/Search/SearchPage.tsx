import { useState, useEffect } from "react";
import { FlatList, View, TextInput, Text, Image, StyleSheet, useColorScheme, TouchableOpacity, Dimensions } from "react-native";
import searchByName from "@/src/api/search";
import GetApiUrl from "@/src/utils/url_api";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { MaterialIcons } from "@expo/vector-icons";
import formatNumber from "@/src/utils/formatNumber";
import { setSearchHistory, getSearchHistory, deleteUserFromHistory } from "@/src/api/history.search";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
const { width } = Dimensions.get("window");
import { useRouter } from "expo-router";
const darkColors = {
    background: 'black',
    cardBackground: '#0a0c1a',
    inputBackground: 'black',
    primary: '#58a6ff',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#05f0d8',
    shadow: '#0917b3',
};

const lightColors = {
    background: '#ffffff',
    cardBackground: '#f5f5f5',
    inputBackground: '#ffffff',
    primary: '#007bff',
    secondary: '#0056b3',
    textPrimary: '#000000',
    textSecondary: '#666666',
    border: '#cccccc',
    shadow: '#000000',
};

interface User {
    user_id: number;
    avatar: string;
    username: string;
    official: boolean;
    readers_count: number;
}

export default function SearchPage() {
    const colorScheme = useColorScheme();
    const colors = colorScheme === "dark" ? darkColors : lightColors;
    const router = useRouter(); 
    const [searchName, setSearchName] = useState<string>("");
    const [users, setUsers] = useState<User[]>([]);
    const [notExist, setNotExist] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [searchHistoryUser, setSearchHistoryUser] = useState<User[]>([]);

    const fetchHistory = async () => {
        const response = await getSearchHistory();
        setSearchHistoryUser(response.data);
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
            }
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
    )


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
    )

    const handleDeleteUser = async (userId: number) => {
        await deleteUserFromHistory(userId);
        fetchHistory();
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: "row" }}>
                <View
                    style={{
                        height: 50,
                        width: 50,
                        backgroundColor: colors.inputBackground,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: "center",
                        alignItems: "center",
                        borderTopLeftRadius: 8,
                        borderBottomLeftRadius: 8,
                        borderRightWidth: 0,
                    }}
                >
                    <MaterialIcons color={colors.textSecondary} size={24} style={{ marginLeft: 10 }} name="search" />
                </View>
                <TextInput
                    style={[
                        styles.input,
                        { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.textPrimary },
                    ]}
                    value={searchName}
                    placeholder="Search"
                    placeholderTextColor={colors.textSecondary}
                    onChangeText={setSearchName}
                />
            </View>
            {!searchName.length && searchHistoryUser.length > 0 && (
                <FlatList
                    data={searchHistoryUser}
                    keyExtractor={(item) => item.user_id.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={[styles.userContainer, { borderBottomColor: colors.border, position: "relative" }]}  onPress={() => {setSearchHistory(item.user_id); router.push({ pathname: "/user-profile", params: { id: item.user_id, last_page: "search" } })}}>
                            <Image source={{ uri: `${GetApiUrl().slice(0, 26)}/media/${item.avatar}` }} style={styles.avatar} />
                            <View>
                                <View style={{ flexDirection: "row" }}>
                                    <Text style={[styles.username, { color: colors.textPrimary }]}>{item.username}</Text>
                                    {item.official && <MaterialIcons name="check-circle" color="#58a6ff" style={{ marginTop: 5, marginLeft: 5 }} />}
                                </View>
                                <Text style={{ color: "gray", fontWeight: "800" }}>{formatNumber(item.readers_count)} Subs</Text>
                            </View>
                            <TouchableOpacity onPress={() => handleDeleteUser(item.user_id)} style={{ position: "absolute", right: 10 }}>
                                <MaterialIcons name="close" color={colors.textPrimary} size={24} />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}
                />
            )}

            {loading && (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginTop: -70 }}>
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 10 }} />
                </View>
            )}

            {!loading && !notExist ? (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.user_id.toString()}
                    onEndReachedThreshold={0.5}
                    initialNumToRender={2}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={[styles.userContainer, { borderBottomColor: colors.border }]} onPress={() => {setSearchHistory(item.user_id); router.push({ pathname: "/user-profile", params: { id: item.user_id } })}}>
                            <Image source={{ uri: `${GetApiUrl().slice(0, 26)}/media/${item.avatar}` }} style={styles.avatar} />
                            <View>
                                <View style={{ flexDirection: "row" }}>
                                    <Text style={[styles.username, { color: colors.textPrimary }]}>{item.username}</Text>
                                    {item.official && <MaterialIcons name="check-circle" color="#58a6ff" style={{ marginTop: 5, marginLeft: 5 }} />}
                                </View>
                                <Text style={{ color: "gray", fontWeight: "800" }}>{formatNumber(item.readers_count)} Subs</Text>
                            </View>
                        </TouchableOpacity>
                    )}
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
        padding: 16,
    },
    input: {
        height: 50,
        borderWidth: 1,
        borderLeftWidth: 0,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        paddingHorizontal: 10,
        marginBottom: 10,
        width: width - (32 + 50),
    },
    userContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 30,
        marginRight: 10,
    },
    username: {
        fontSize: 16,
    },
});
