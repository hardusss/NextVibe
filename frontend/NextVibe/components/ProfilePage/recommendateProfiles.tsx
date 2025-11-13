import React, { useEffect, useState } from "react";
import { 
    View, Text, FlatList, TouchableOpacity, 
    StyleSheet, useColorScheme, Dimensions 
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import FastImage from "react-native-fast-image";
import { useRouter } from "expo-router";
import getRoccomendationsProfiles from "@/src/api/recommendations.profiles";
import GetApiUrl from "@/src/utils/url_api";
import followUser from "@/src/api/follow";

const screenWidth = Dimensions.get("window").width;

const lightTheme = {
    background: "#ffffff",
    cardBackground: "#f7f7f7",
    textPrimary: "#111111",
    textSecondary: "#666666",
    border: "#e2e2e2",
    followButtonGradient: ["#7F00FF", "#E100FF"],
    followText: "#ffffff",
    followedButton: "#262626",
    followedText: "#ffffff",
    iconColor: "black"
};

const darkTheme = {
    background: "#0A0410", 
    cardBackground: "#180B32", 
    textPrimary: "#ffffff",
    textSecondary: "#8b949e",
    border: "transparent",
    followButtonGradient: ["#6A00F4", "#BC00DD"],
    followText: "#ffffff",
    followedButton: "#1E1E1E",
    followedText: "#E0E0E0",
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
            setFollowedUsers(prev =>
                prev.includes(id)
                    ? prev.filter(userId => userId !== id)
                    : [...prev, id]
            );
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.textPrimary }]}>
                    Recommended for you
                </Text>
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
                    renderItem={({ item }) => {
                        const isFollowed = followedUsers.includes(item.id);
                        return (
                            <TouchableOpacity 
                                style={[
                                    styles.userCard, 
                                    { backgroundColor: theme.cardBackground, borderColor: theme.border }
                                ]} 
                                onPress={() => 
                                    router.push({ 
                                        pathname: "/user-profile", 
                                        params: { id: item.id, last_page: "profile" } 
                                    })
                                }
                            > 
                                <FastImage 
                                    source={{ uri: `${GetApiUrl().slice(0, 26)}/media/${item.avatar}` }} 
                                    style={styles.avatar} 
                                />
                                <View style={styles.userInfo}>
                                    <View style={styles.nameContainer}>
                                        <Text 
                                            style={[styles.username, { color: theme.textPrimary }]}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                        >
                                            {item.username}
                                        </Text>
                                        {item.official && (
                                            <MaterialIcons 
                                                name="check-circle" 
                                                size={16} 
                                                color="#58a6ff" 
                                                style={{ marginLeft: 4 }}
                                            />
                                        )}
                                    </View>

                                    <TouchableOpacity 
                                        onPress={() => handleFollowUnfollow(item.id)} 
                                        activeOpacity={0.8}
                                        style={[
                                            styles.followButton,
                                            { 
                                                backgroundColor: isFollowed 
                                                    ? theme.followedButton 
                                                    : undefined,
                                                
                                            }
                                        ]}
                                    >
                                        <View style={[
                                            styles.followGradient, 
                                            { 
                                                backgroundColor: isFollowed 
                                                    ? "transparent" 
                                                    : theme.followButtonGradient[0]
                                            }
                                        ]}>
                                            <Text style={[
                                                styles.followText,
                                                { color: theme.followText }
                                            ]}>
                                                {isFollowed ? "Unfollow" : "Follow"}
                                            </Text>
                                        </View>
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
        paddingHorizontal: 10
    },
    title: {
        fontSize: 18,
        fontWeight: "bold",
    },
    iconButton: {
        padding: 5,
    },
    userCard: {
        width: screenWidth * 0.38,
        borderRadius: 16,
        marginRight: 15,
        padding: 12,
        alignItems: "center",
    },
    avatar: {
        width: 75,
        height: 75,
        borderRadius: 40,
        marginBottom: 10,
    },
    userInfo: {
        alignItems: "center",
        width: "100%",
    },
    nameContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        maxWidth: "90%",
        marginBottom: 8,
    },
    username: {
        fontWeight: "bold",
        fontSize: 14,
        maxWidth: 100,
    },
    followButton: {
        borderRadius: 12,
        overflow: "hidden",
        width: "100%",
    },
    followGradient: {
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        shadowColor: "#BB00FF",
        shadowOpacity: 0.4,
        shadowRadius: 8,
    },
    followText: {
        fontSize: 14,
        fontWeight: "700",
    },
});

export default RecommendedUsers;
