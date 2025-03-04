import React, { useState } from 'react';
import { View, ScrollView, StatusBar, Text, FlatList, StyleSheet, Image, TextInput, TouchableOpacity, Switch, useColorScheme, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { ResizeMode } from 'expo-av';
import createPost from '@/src/api/create.post';


const darkColors = {
    background: '#09080f',
    cardBackground: '#0a0c1a',
    inputBackground: '#0a0c1a',
    primary: '#58a6ff',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#0b0c2e',
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

const {width, height} = Dimensions.get("window")


export default function PostCreate() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const mediaUrls = typeof params.urls === 'string' ? JSON.parse(params.urls) : [];
    const [postText, setPostText] = useState('');
    const [location, setLocation] = useState('');
    const [enableComments, setEnableComments] = useState(true);

    const colorScheme = useColorScheme();
    const colors = colorScheme === 'dark' ? darkColors : lightColors;

    const isVideo = (uri: string): boolean => {
        return uri.endsWith('.mp4') || uri.endsWith('.mov');
    };

    const renderMedia = ({ item }: { item: string }) => {
        if (isVideo(item)) {
            return (
                <View style={themedStyles.mediaContainer}>
                    <Video
                        source={{ uri: item.startsWith('file://') ? item : `file://${item}` }}
                        style={themedStyles.media}
                        useNativeControls={false}
                        isLooping
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={true}
                    />
                </View>
            );
        } else {
            return (
                <View style={themedStyles.mediaContainer}>
                    <Image
                        source={{ uri: item.startsWith('file://') ? item : `file://${item}` }}
                        style={themedStyles.media}
                        resizeMode="cover"
                    />
                </View>
            );
        }
    };

    const handlePublish = () => {
        createPost(postText, mediaUrls, location)
        router.push("/profile")
    };

    const handleSaveDraft = () => {
        console.log('Post saved as draft:', { postText, location, enableComments });
        router.back();
    };

    const themedStyles = StyleSheet.create({
        container: {
            flex: 1,
            padding: 16,
            backgroundColor: colors.background,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
        },
        headerText: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        flatListContent: {
            justifyContent: 'center', 
            alignItems: 'center',
        },
        mediaContainer: {
            width: width * 0.75,
            height: height * 0.4,
            marginRight: 10,
            borderRadius: 10,
            overflow: 'hidden',
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
        },
        media: {
            width: '100%',
            height: '100%',
        },
        textArea: {
            height: 100,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 10,
            padding: 10,
            marginVertical: 10,
            textAlignVertical: 'top',
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
        },
        input: {
            height: 50,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 10,
            padding: 10,
            marginVertical: 10,
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
        },
        switchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginVertical: 10,
        },
        switchLabel: {
            fontSize: 16,
            color: colors.textPrimary,
        },
        footer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 20,
            paddingBottom: 20,
        },
        button: {
            flex: 1,
            padding: 15,
            borderRadius: 10,
            alignItems: 'center',
            backgroundColor: colors.cardBackground,
            marginHorizontal: 5,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
        },
        publishButton: {
            backgroundColor: colors.primary,
        },
        buttonText: {
            fontSize: 16,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
    });

    return (
        <ScrollView style={themedStyles.container}>
            <StatusBar backgroundColor={colors.background}></StatusBar>
            <View style={themedStyles.header}>
                <TouchableOpacity onPress={() => router.push("/camera")}>
                    <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={themedStyles.headerText}>New Post</Text>
            </View>

            <View style={{ alignItems: "center" }}>
                <FlatList
                    data={mediaUrls}
                    renderItem={renderMedia}
                    keyExtractor={(item, index) => index.toString()}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={themedStyles.flatListContent}
                />
            </View>    

            <TextInput
                style={themedStyles.textArea}
                multiline
                placeholder="Enter about post..."
                placeholderTextColor={colors.textSecondary}
                value={postText}
                onChangeText={setPostText}
            />

            <TextInput
                style={themedStyles.input}
                placeholder="Add location..."
                placeholderTextColor={colors.textSecondary}
                value={location}
                onChangeText={setLocation}
            />

            <View style={themedStyles.switchContainer}>
                <Text style={themedStyles.switchLabel}>Enable Comments</Text>
                <Switch
                    value={enableComments}
                    onValueChange={setEnableComments}
                    trackColor={{ false: '#767577', true: colors.primary }}
                    thumbColor={enableComments ? colors.primary : '#f4f3f4'}
                />
            </View>

            <View style={themedStyles.footer}>
                <TouchableOpacity style={[themedStyles.button, { backgroundColor: colors.cardBackground }]} onPress={handleSaveDraft}>
                    <Text style={themedStyles.buttonText}>Save as Draft</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[themedStyles.button, themedStyles.publishButton]} onPress={handlePublish}>
                    <Text style={themedStyles.buttonText}>Publish</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}