import React, { useState } from 'react';
import { View, ScrollView, StatusBar, Text, FlatList, StyleSheet, Image, TextInput, TouchableOpacity, Switch, useColorScheme, Dimensions, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video } from 'expo-av';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { ResizeMode } from 'expo-av';
import createPost from '@/src/api/create.post';
import generateImage from '@/src/api/generate.image';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

const darkColors = {
    background: 'black',
    cardBackground: 'black', 
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

const {width, height} = Dimensions.get("window")

export default function PostCreate() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const [mediaUrls, setMediaUrls] = useState<string[]>(typeof params.urls === 'string' ? JSON.parse(params.urls) : []);
    const [postText, setPostText] = useState('');
    const [location, setLocation] = useState('');
    const [enableComments, setEnableComments] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const colorScheme = useColorScheme();
    const colors = colorScheme === 'dark' ? darkColors : lightColors;

    useFocusEffect(
        useCallback(() => {
            const newMediaUrls = typeof params.urls === 'string' ? JSON.parse(params.urls) : [];
            setMediaUrls((prevUrls) => {
                return JSON.stringify(prevUrls) !== JSON.stringify(newMediaUrls) ? newMediaUrls : prevUrls;
            });
        }, [params.urls]) 
    );
    
    const isVideo = (uri: string): boolean => {
        return uri.endsWith('.mp4') || uri.endsWith('.mov');
    };

    const handleDeleteImage = (item: string) => {
        if (mediaUrls.length !== 0) {
            setMediaUrls(prev => prev.filter(url => url !== item));
        }
    };

    const renderMedia = ({ item }: { item: string }) => {
        if (isVideo(item)) {
            return (
                <View style={themedStyles.mediaContainer}>
                    <View style={{
                        backgroundColor: "black",
                        position: "absolute",
                        right: 0,
                        top: 0,
                        width: 20,
                        height: 20
                    }}>
                        <MaterialIcons name="close" color="white"/>
                    </View>
                    <Video
                        source={{ uri: item.startsWith('file://') ||  item.startsWith('https://')? item : `file://${item}` }}
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
                    <TouchableOpacity onPress={() => handleDeleteImage(item)} style={{
                        backgroundColor: "rgba(0, 0, 0, 0.6)",
                        justifyContent: "center",
                        alignItems: "center",
                        borderRadius: 50,
                        position: "absolute",
                        right: 10,
                        top: 10,
                        width: 40,
                        height: 40,
                        zIndex: 9990
                    }}>
                        <MaterialIcons name="close" color="white" size={30}/>
                    </TouchableOpacity>
                    <Image
                        source={{ uri: item.startsWith('https://') || item.startsWith('file://') ? item : `file://${item}` }}
                        style={themedStyles.media}
                        resizeMode="cover"
                    />
                </View>
            );
        }
    };

    const handlePublish = () => {
        createPost(postText, mediaUrls, location)
        setMediaUrls([]);
        setAiPrompt("");
        setLocation("");
        setPostText("");
        router.push("/profile")
    };

    const handleSaveDraft = () => {
        setMediaUrls([]);
        setAiPrompt("");
        setLocation("");
        setPostText("");
        router.back();
    };

    const handleGenerateWithAI = async () => {
        setIsGenerating(true);
        setIsModalVisible(false); 
        const generatedImage = await generateImage(aiPrompt);
        setMediaUrls(prev => [generatedImage as string, ...prev])
        setPostText(aiPrompt);
        setIsGenerating(false);
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
            position: "relative",
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
            marginHorizontal: 5,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
        },
        publishButton: {
            backgroundColor: "#05f0d8",
        },
        buttonText: {
            fontSize: 16,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        modalContainer: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
        modalContent: {
            width: '100%',
            padding: 20,
            backgroundColor: colors.cardBackground,
            borderColor: colors.border,
            borderTopWidth: 2,
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
        },
        modalInputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        modalInput: {
            flex: 1,
            height: 50,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 10,
            padding: 10,
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
        },
        modalButton: {
            padding: 10,
            borderRadius: 10,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
        },
    });

    return (
        <ScrollView style={themedStyles.container}>
            <StatusBar backgroundColor={colors.background}></StatusBar>
            <View style={themedStyles.header}>
                <TouchableOpacity onPress={() => {
                    setMediaUrls([]);
                    setAiPrompt("");
                    setLocation("");
                    setPostText("");
                    router.push("/camera")
                    }}>
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
                    trackColor={{ false: '#767577', true: "#05f0d8" }}
                    thumbColor={enableComments ? '#05f0d8' : '#f4f3f4'}
                />
            </View>

            <TouchableOpacity 
                style={[themedStyles.button, { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border }]} 
                onPress={() =>{ setIsModalVisible(true)}}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <ActivityIndicator color={colors.textPrimary} />
                ) : (
                    <Text style={[themedStyles.buttonText, {color: "#05f0d8"}]}>Generate with AI</Text>
                )}
            </TouchableOpacity>

            <Modal
                visible={isModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={themedStyles.modalContainer}
                >
                    <View style={themedStyles.modalContent}>
                        <View style={themedStyles.modalHeader}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary }}>Generate with AI</Text>
                            <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                                <MaterialIcons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <View style={themedStyles.modalInputContainer}>
                            <TextInput
                                style={themedStyles.modalInput}
                                placeholder="Enter your prompt..."
                                placeholderTextColor={colors.textSecondary}
                                value={aiPrompt}
                                onChangeText={setAiPrompt}
                            />
                            <TouchableOpacity 
                                style={themedStyles.modalButton} 
                                onPress={handleGenerateWithAI}
                            >
                                <Ionicons name="arrow-forward" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <View style={themedStyles.footer}>
                <TouchableOpacity style={[themedStyles.button, { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border }]} onPress={handleSaveDraft}>
                    <Text style={[themedStyles.buttonText, {color: "#05f0d8"}]}>Save as Draft</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[themedStyles.button, themedStyles.publishButton]} onPress={handlePublish}>
                    <Text style={[themedStyles.buttonText, {color: "black"}]}>Publish</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}