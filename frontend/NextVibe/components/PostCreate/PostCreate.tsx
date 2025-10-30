import React, { useEffect, useState, useRef } from 'react';
import { View, ScrollView, StatusBar, Text, FlatList, StyleSheet, Image, TextInput, TouchableOpacity, Switch, useColorScheme, Dimensions, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video } from 'expo-av';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { ResizeMode } from 'expo-av';
import createPost from '@/src/api/create.post';
import generateImage from '@/src/api/generate.image';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import FastImage from 'react-native-fast-image';
import ButtonAI from './GenerateAIButton';
import Web3Toast from '../Shared/Toasts/Web3Toast';

const lightColors = {
    background: '#FAFAFA',
    cardBackground: '#FFFFFF',
    inputBackground: '#F5F5F5',
    primary: '#6366F1',
    secondary: '#818CF8',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    shadow: '#000000',
    accent: '#8B5CF6',
    success: '#10B981',
};

const darkColors = {
    background: '#0A0410',
    cardBackground: '#1a0f2e',
    inputBackground: '#2a1f3d',
    primary: '#A78BFA',
    secondary: '#8B5CF6',
    textPrimary: '#F9FAFB',
    textSecondary: '#C4B5FD',
    border: '#4C3B6D',
    shadow: '#000000',
    accent: '#A78BFA',
    success: '#34D399',
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
    const [isAiGenerated, setIsAiGenerated] = useState(false);
    const [isVisibleToast, setIsVisibleToast] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string>("");
    const [toastSuccess, setToastSuccess] = useState<boolean>(false);
    const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);
    const videoRefs = useRef<{ [key: number]: Video | null }>({});
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

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            const newIndex = viewableItems[0].index;
            setActiveVideoIndex(newIndex);
            
            // Зупиняємо всі відео
            Object.keys(videoRefs.current).forEach(async (key) => {
                const index = parseInt(key);
                if (videoRefs.current[index] && index !== newIndex) {
                    await videoRefs.current[index]?.pauseAsync();
                }
            });
            
            // Програємо активне відео
            if (videoRefs.current[newIndex] && isVideo(mediaUrls[newIndex])) {
                videoRefs.current[newIndex]?.playAsync();
            }
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const renderMedia = ({ item, index }: { item: string; index: number }) => {
        if (isVideo(item)) {
            return (
                <View style={themedStyles.mediaContainer}>
                    <TouchableOpacity 
                        onPress={() => handleDeleteImage(item)} 
                        style={themedStyles.deleteButton}
                    >
                        <MaterialIcons name="close" color="white" size={20}/>
                    </TouchableOpacity>
                    <Video
                        ref={(ref) => {
                            videoRefs.current[index] = ref;
                        }}
                        source={{ uri: item.startsWith('file://') ||  item.startsWith('https://')? item : `file://${item}` }}
                        style={themedStyles.media}
                        useNativeControls={false}
                        isLooping
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={index === activeVideoIndex}
                    />
                </View>
            );
        } else {
            return (
                <View style={themedStyles.mediaContainer}>
                    <TouchableOpacity 
                        onPress={() => handleDeleteImage(item)} 
                        style={themedStyles.deleteButton}
                    >
                        <MaterialIcons name="close" color="white" size={20}/>
                    </TouchableOpacity>
                    <FastImage
                        source={{ 
                            uri: item.startsWith('https://') || item.startsWith('file://') ? item : `file://${item}`,
                            priority: FastImage.priority.normal,
                            cache: FastImage.cacheControl.immutable
                        }}
                        style={themedStyles.media}
                        resizeMode={FastImage.resizeMode.cover}
                    />
                </View>
            );
        }
    };

    const handlePublish = () => {
        if (mediaUrls.length > 3){
            setToastMessage("Error. A post can contain a maximum of 3 media files!");
            setToastSuccess(false)
            setIsVisibleToast(true);
            return;
        }
        createPost(postText, mediaUrls, location, isAiGenerated, enableComments);
        setMediaUrls([]);
        setAiPrompt("");
        setLocation("");
        setPostText("");
        setIsAiGenerated(false);
        router.replace("/profile");
    };

    const handleGenerateWithAI = async () => {
        setIsGenerating(true);
        setIsModalVisible(false); 
        const generatedImage = await generateImage(aiPrompt);
        if (generatedImage.image_url) {
            setToastMessage("Photo generated successfully🥳")
            setToastSuccess(true)
            setIsVisibleToast(true);
            setMediaUrls(prev => [generatedImage.image_url as string, ...prev]);
        } else {
            setToastSuccess(false)
            setToastMessage(generatedImage.error);
            setIsVisibleToast(true);
        }
        setIsAiGenerated(true);
        setIsGenerating(false);
    };

    const themedStyles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 16,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: colorScheme === 'dark' ? 0.3 : 0.05,
            shadowRadius: 3,
            elevation: 3,
        },
        backButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : colors.inputBackground,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
        },
        headerText: {
            fontSize: 22,
            fontWeight: '700',
            color: colors.textPrimary,
            letterSpacing: 0.3,
        },
        contentContainer: {
            marginTop: -15,
            padding: 16,
        },
        flatListContent: {
            paddingVertical: 8,
            width: mediaUrls.length === 1 ? "100%" : "auto"
        },
        mediaContainer: {
            width: width * 0.65,
            height: height * 0.3,
            position: "relative",
            marginRight: 12,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: colors.inputBackground,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.1,
            shadowRadius: 8,
            elevation: 5,
        },
        media: {
            width: '100%',
            height: '100%',
        },
        deleteButton: {
            position: 'absolute',
            right: 8,
            top: 8,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9990,
        },
        inputCard: {
            backgroundColor: colors.cardBackground,
            borderRadius: 16,
            padding: 12,
            marginBottom: 12,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: colorScheme === 'dark' ? 0.3 : 0.05,
            shadowRadius: 6,
            elevation: 2,
        },
        textArea: {
            minHeight: 80,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 14,
            textAlignVertical: 'top',
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
            lineHeight: 18,
            resizeMode: "none"
        },
        input: {
            height: 22,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
        },
        inputWithIcon: {
            flexDirection: 'row',
            alignItems: 'center',
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            backgroundColor: colors.inputBackground,
            paddingHorizontal: 14,
            height: 42,
        },
        inputIcon: {
            marginRight: 10,
        },
        inputField: {
            flex: 1,
            fontSize: 16,
            color: colors.textPrimary,
        },
        switchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.cardBackground,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: colorScheme === 'dark' ? 0.3 : 0.05,
            shadowRadius: 6,
            elevation: 2,
        },
        switchLabel: {
            fontSize: 16,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        
        footer: {
            padding: 16,
            paddingBottom: 32,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        button: {
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 4,
        },
        publishButton: {
            backgroundColor: colors.primary,
        },
        buttonText: {
            fontSize: 17,
            fontWeight: '700',
            color: '#FFFFFF',
            letterSpacing: 0.5,
        },
        modalContainer: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        modalContent: {
            width: '100%',
            padding: 24,
            backgroundColor: colors.cardBackground,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 10,
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
        },
        modalTitle: {
            fontSize: 20,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        modalCloseButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : colors.inputBackground,
            justifyContent: 'center',
            alignItems: 'center',
        },
        modalInputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        modalInput: {
            flex: 1,
            height: 52,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
        },
        modalButton: {
            width: 52,
            height: 52,
            borderRadius: 12,
            backgroundColor: aiPrompt.length === 0 ? "#2e2e2eff" : colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: aiPrompt.length === 0 ? "#2e2e2eff" : colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        },
        sectionTitle: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textSecondary,
            marginLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
    });

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Web3Toast message={toastMessage} visible={isVisibleToast} onHide={() => {setIsVisibleToast(false)}} isSuccess={toastSuccess}/>
            <StatusBar 
                backgroundColor={colors.background}
                barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
            />
            
            <View style={themedStyles.header}>
                <TouchableOpacity 
                    style={themedStyles.backButton}
                    onPress={() => {
                        setMediaUrls([]);
                        setAiPrompt("");
                        setLocation("");
                        setPostText("");
                        router.back()
                    }}
                >
                    <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={themedStyles.headerText}>New Post</Text>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                <View style={themedStyles.contentContainer}>
                    {mediaUrls.length > 0 && (
                        <View style={{ marginBottom: 5 }}>
                            <Text style={themedStyles.sectionTitle}>Media</Text>
                            <FlatList
                                data={mediaUrls}
                                renderItem={renderMedia}
                                keyExtractor={(item, index) => index.toString()}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={[
                                    themedStyles.flatListContent,
                                    mediaUrls.length === 1 && { justifyContent: 'center' },
                                ]}
                                onViewableItemsChanged={onViewableItemsChanged}
                                viewabilityConfig={viewabilityConfig}
                            />
                        </View>
                    )}

                    <View>
                        <Text style={themedStyles.sectionTitle}>Description</Text>
                        <View style={themedStyles.inputCard}>
                            <TextInput
                                style={[themedStyles.textArea, { maxHeight: 80 }]}
                                multiline
                                scrollEnabled={true}
                                textAlignVertical="top"
                                placeholder="What's on your mind?"
                                placeholderTextColor={colors.textSecondary}
                                value={postText}
                                onChangeText={setPostText}
                            />

                        </View>
                    </View>

                    <View>
                        <View style={themedStyles.inputCard}>
                            <View style={themedStyles.inputWithIcon}>
                                <Ionicons 
                                    name="location-outline" 
                                    size={20} 
                                    color={colors.textSecondary} 
                                    style={themedStyles.inputIcon}
                                />
                                <TextInput
                                    style={themedStyles.inputField}
                                    placeholder="Add location..."
                                    placeholderTextColor={colors.textSecondary}
                                    value={location}
                                    onChangeText={setLocation}
                                />
                            </View>
                        </View>
                    </View>

                    <View style={themedStyles.switchContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons 
                                name="chatbubble-outline" 
                                size={20} 
                                color={colors.textPrimary} 
                                style={{ marginRight: 10 }}
                            />
                            <Text style={themedStyles.switchLabel}>Enable Comments</Text>
                        </View>
                        <Switch
                            value={enableComments}
                            onValueChange={setEnableComments}
                            trackColor={{ 
                                false: colorScheme === 'dark' ? '#4B5563' : '#D1D5DB', 
                                true: colors.secondary 
                            }}
                            thumbColor={enableComments ? colors.primary : '#F3F4F6'}
                            ios_backgroundColor={colorScheme === 'dark' ? '#4B5563' : '#D1D5DB'}
                        />
                    </View>

                    <ButtonAI onClick={() => setIsModalVisible(true)} isGenerating={isGenerating}/>
                </View>

                <View style={themedStyles.footer}>
                    <TouchableOpacity 
                        style={[themedStyles.button, themedStyles.publishButton]} 
                        onPress={handlePublish}
                    >
                        <Text style={themedStyles.buttonText}>Publish Post</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

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
                    <TouchableOpacity 
                        style={{ flex: 1 }} 
                        activeOpacity={1} 
                        onPress={() => setIsModalVisible(false)}
                    />
                    <View style={themedStyles.modalContent}>
                        <View style={themedStyles.modalHeader}>
                            <Text style={themedStyles.modalTitle}>Generate with AI</Text>
                            <TouchableOpacity 
                                style={themedStyles.modalCloseButton}
                                onPress={() => setIsModalVisible(false)}
                            >
                                <MaterialIcons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <View style={themedStyles.modalInputContainer}>
                            <TextInput
                                style={themedStyles.modalInput}
                                placeholder="Describe your image..."
                                placeholderTextColor={colors.textSecondary}
                                value={aiPrompt}
                                onChangeText={setAiPrompt}
                            />
                            <TouchableOpacity 
                                style={themedStyles.modalButton} 
                                onPress={handleGenerateWithAI}
                                disabled={aiPrompt.length ===  0}
                            >
                                <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                gap: 8,
                                marginTop: 8,
                                backgroundColor: "rgba(255, 165, 0, 0.1)",
                                borderRadius: 12,
                                padding: 10,
                                borderLeftWidth: 3,
                                borderLeftColor: "orange",
                            }}
                            >
                            <Ionicons name="alert-circle-outline" size={22} color="orange" style={{ marginTop: 2 }} />
                            <Text
                                style={{
                                color: useColorScheme() === "dark" ? "#fafafa" : "black",
                                fontSize: 13.5,
                                lineHeight: 18,
                                flex: 1,
                                fontWeight: "400",
                                }}
                            >
                                <Text style={{ fontWeight: "700" }}>Beta:</Text> Only 1 generation is available for now. New
                                generations will be added later — follow our social media.{"\n"}
                                 <Text style={{ fontWeight: "700" }}>Prompt must be in English</Text>, otherwise the generation
                                will fail.
                            </Text>
                        </View>

                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}