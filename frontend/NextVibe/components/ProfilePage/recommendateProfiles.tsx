import React, { useEffect, useState } from "react";
import { 
    View, Text, Image, FlatList, TouchableOpacity, 
    StyleSheet, useColorScheme 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import getRoccomendationsProfiles from "@/src/api/recommendations.profiles";
import GetApiUrl from "@/src/utils/url_api";
import { MaterialIcons } from '@expo/vector-icons';
import followUser from "@/src/api/follow";
import { useRouter } from "expo-router";

const lightTheme = {
    background: "#ffffff",
    cardBackground: "#f0f0f0",
    textPrimary: "#333333",
    textSecondary: "#666666",
    border: "#d1d1d1",
    followButton: "#0095f6",
    followText: "#ffffff",
    followedButton: "#262626",
    followedText: "#ffffff",
    iconColor: "black"
};

const darkTheme = {
    background: "black", // #09080f
    cardBackground: "black", //rgba(11, 18, 76, 0.3)
    textPrimary: "#ffffff",
    textSecondary: "#8b949e",
    border: "#05f0d8", // #5A31F4
    followButton: "#0095f6",
    followText: "#ffffff",
    followedButton: "#262626",
    followedText: "#ffffff",
    iconColor: "white"
};

const RecommendedUsers = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [expanded, setExpanded] = useState(true); 
    const [followedUsers, setFollowedUsers] = useState<number[]>([]); 
    const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
    const router = useRouter();

    useEffect(() => {
        const fetchRecommendedUsers = async () => {
            try {
                const response = await getRoccomendationsProfiles();
                setUsers(response.recommended_users);
            } catch (error) {
                console.error("Error fetching recommendations:", error);
            } 
        };

        fetchRecommendedUsers();
    }, []);

    const handleFollowUnfollow = async (id: number) => {
        const response = await followUser(id);
        if (response === 200) {
            setFollowedUsers(prevState => 
                prevState.includes(id) 
                    ? prevState.filter(userId => userId !== id) 
                    : [...prevState, id]
            );
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.textPrimary }]}>Recommended for you</Text>
                <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.iconButton}>
                    <Ionicons 
                        name={expanded ? "chevron-up" : "chevron-down"} 
                        size={24} 
                        color={theme.iconColor} 
                    />
                </TouchableOpacity>
            </View>

            {expanded && (
                <FlatList
                    horizontal
                    data={users}
                    keyExtractor={(item) => item.id.toString()}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.listContainer}
                    nestedScrollEnabled
                    renderItem={({ item }) => {
                        const isFollowed = followedUsers.includes(item.id);

                        return (
                            <TouchableOpacity style={[styles.userCard, { backgroundColor: theme.cardBackground, borderColor: theme.border, borderWidth: 1 }]} onPress={ () => router.push({ pathname: "/user-profile", params: { id: item.id, last_page: "profile" } })} > 
                                <Image 
                                    source={{ uri: `${GetApiUrl().slice(0, 25)}/media/${item.avatar}` }} 
                                    style={styles.avatar} 
                                />
                                <View style={styles.userInfo}>
                                    <View style={{ flexDirection: "row" }}>
                                        <Text style={[styles.username, { color: theme.textPrimary }]}>{item.username}</Text>
                                        {item.official && (
                                            <MaterialIcons name="check-circle" size={16} color="#58a6ff" style={{ marginLeft: 5, marginTop: 1 }} />
                                        )}
                                    </View>
                                    <TouchableOpacity 
                                        onPress={() => handleFollowUnfollow(item.id)} 
                                        style={[styles.followButton, { backgroundColor: isFollowed ? theme.followedButton : theme.followButton }]}
                                    >
                                        <Text style={[styles.followText, { color: theme.followText }]}>
                                            {isFollowed ? "Unfollow" : "Follow"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 20,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    title: {
        fontSize: 20,
        fontWeight: "bold",
    },
    iconButton: {
        padding: 5,
    },
    listContainer: {},
    userCard: {
        padding: 15,
        borderRadius: 15,
        marginRight: 15,
        width: 140,
        alignItems: "center",
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        marginBottom: 10,
    },
    userInfo: {
        alignItems: "center",
        width: "100%",
    },
    username: {
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 5,
        maxWidth: 120,
    },
    followButton: {
        paddingVertical: 6,
        paddingHorizontal: 20,
        borderRadius: 20,
        marginTop: "auto",
    },
    followText: {
        fontWeight: "bold",
    },
});

export default RecommendedUsers;
