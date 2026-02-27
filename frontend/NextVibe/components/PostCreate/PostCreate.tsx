import React, { useState, useRef } from 'react';
import { View, ScrollView, StatusBar, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Switch, useColorScheme, Dimensions, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'; 
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import createPost from '@/src/api/create.post';
import generateImage from '@/src/api/generate.image';
import generateImageStatus from '@/src/api/get.image.status';
import FastImage from 'react-native-fast-image';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import ConfirmDialog from '../Shared/Toasts/ConfirmDialog';
import { Vibration } from 'react-native';

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

// vibration patterns
const SUCCESS_VIBRATION_PATTERN = [30, 60, 30, 80, 50];
const FAIL_VIBRATION_PATTERN = [150, 70, 50, 200];

function VideoPlayer({ uri, isActive }: { uri: string; isActive: boolean }) {
    const video = useRef<Video>(null);
    const [status, setStatus] = useState<AVPlaybackStatus>();

    return (
        <View style={{ flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
            {(!status?.isLoaded) && (
                <ActivityIndicator size="large" color="white" style={{ position: 'absolute', zIndex: 1 }} />
            )}
            
            <Video
                ref={video}
                style={{ width: '100%', height: '100%' }}
                source={{ uri: uri }}
                useNativeControls={false} 
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={isActive}
                isMuted={false} 
                onPlaybackStatusUpdate={status => setStatus(() => status)}
                onError={(error) => console.error("Video Load Error:", error)}
                onLoadStart={() => console.log("Video loading started:", uri)}
                onLoad={(status) => console.log("Video loaded successfully", status)}
            />
        </View>
    );
}

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
    const [isVisibleConfirm, setIsVisibleConfirm] = useState<boolean>(false);
    const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);
    const [generationStatus, setGenerationStatus] = useState<string>("");
    const colorScheme = useColorScheme();
    const colors = colorScheme === 'dark' ? darkColors : lightColors;
    const pollingInterval = useRef<NodeJS.Timeout | number>(null);
    
    const isVideo = (uri: string): boolean => {
        return uri.match(/\.(mp4|mov|mkv|webm|ogg)$/i) !== null;
    };

    const handleDeleteImage = (item: string) => {
        if (mediaUrls.length !== 1) {
            setMediaUrls(prev => prev.filter(url => url !== item));
        } else {
            setToastMessage("Error. You must have at least 1 media to post.");
            setToastSuccess(false)
            setIsVisibleToast(true);
        }
    };

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            const newIndex = viewableItems[0].index;
            setActiveVideoIndex(newIndex);
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const renderMedia = ({ item, index }: { item: string; index: number }) => {
        const fixedUri = item.startsWith('file://') || item.startsWith('https://') 
            ? item 
            : `file://${item}`;

        if (isVideo(item)) {
            return (
                <View style={themedStyles.mediaContainer}>
                    <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                        onPress={() => handleDeleteImage(item)} 
                        style={themedStyles.deleteButton}
                    >
                        <MaterialIcons name="close" color="white" size={20}/>
                    </TouchableOpacity>
                    <VideoPlayer 
                        uri={fixedUri}
                        isActive={index === activeVideoIndex}
                    />
                </View>
            );
        } else {
            return (
                <View style={themedStyles.mediaContainer}>
                    <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                        onPress={() => handleDeleteImage(item)} 
                        style={themedStyles.deleteButton}
                    >
                        <MaterialIcons name="close" color="white" size={20}/>
                    </TouchableOpacity>
                    <FastImage
                        source={{ 
                            uri: fixedUri,
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
        if (postText.length > 255) {
            Vibration.vibrate(FAIL_VIBRATION_PATTERN);
            setToastMessage("Post text must be less than 255 characters!");
            setToastSuccess(false);
            setIsVisibleToast(true);
            return;
        };
        if (location.length > 50) {
            Vibration.vibrate(FAIL_VIBRATION_PATTERN);
            setToastMessage("Location must be less than 50 characters!");
            setToastSuccess(false);
            setIsVisibleToast(true);
            return;
        };
        if (mediaUrls.length < 1) {
            Vibration.vibrate(FAIL_VIBRATION_PATTERN);
            setToastMessage("Error. You can't publish post without media!");
            setToastSuccess(false);
            setIsVisibleToast(true);
            return;
        };
        if (mediaUrls.length > 3){
            Vibration.vibrate(FAIL_VIBRATION_PATTERN);
            setToastMessage("Error. A post can contain a maximum of 3 media files!");
            setToastSuccess(false);
            setIsVisibleToast(true);
            return;
        };

        Vibration.vibrate(SUCCESS_VIBRATION_PATTERN);
        createPost(postText, mediaUrls, location, isAiGenerated, enableComments);
        setMediaUrls([]);
        setAiPrompt("");
        setLocation("");
        setPostText("");
        setIsAiGenerated(false);
        router.replace("/profile");
    };

    const pollImageStatus = async (taskId: string) => {
        let attempts = 0;
        const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes max

        pollingInterval.current = setInterval(async () => {
            attempts++;
            
            try {
                const statusResponse = await generateImageStatus(taskId);
                
                if (statusResponse.status === "success" && statusResponse.image_url) {
                    clearInterval(pollingInterval.current!);
                    setGenerationStatus("");
                    setIsGenerating(false);
                    setIsModalVisible(false);
                    setMediaUrls(prev => {
                    const imageUrl = statusResponse.image_url as string;
                        if (prev.includes(imageUrl)) {
                            return prev; 
                        }
                        return [imageUrl, ...prev]; 
                    });
                    setIsAiGenerated(true);
                    setToastMessage("Photo generated successfully 🥳");
                    setToastSuccess(true);
                    setIsVisibleToast(true);
                    setAiPrompt("");
                } else if (statusResponse.status === "failed" || statusResponse.error) {
                    clearInterval(pollingInterval.current!);
                    setGenerationStatus("");
                    setIsGenerating(false);
                    setToastMessage(statusResponse.error || "Image generation failed");
                    setToastSuccess(false);
                    setIsVisibleToast(true);
                } else if (statusResponse.status === "processing") {
                    setGenerationStatus(`Generating your image... (${attempts}/${maxAttempts})`);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(pollingInterval.current!);
                    setGenerationStatus("");
                    setIsGenerating(false);
                    setToastMessage("Image generation timeout. Please try again.");
                    setToastSuccess(false);
                    setIsVisibleToast(true);
                }
            } catch (error) {
                console.error("Error checking image status:", error);
                clearInterval(pollingInterval.current!);
                setGenerationStatus("");
                setIsGenerating(false);
                setToastMessage("Error checking generation status");
                setToastSuccess(false);
                setIsVisibleToast(true);
            }
        }, 2000);  
    };

    const handleGenerateWithAI = async () => {
        if (aiPrompt.trim().length === 0) return;

        setIsGenerating(true);
        setGenerationStatus("Starting generation...");
        
        try {
            const response = await generateImage(aiPrompt);
            
            if (response.taskId) {
                setGenerationStatus("You are in queue for image generation. Please don't leave this page...");
                pollImageStatus(response.taskId);
            } else if (response.error) {
                setIsGenerating(false);
                setGenerationStatus("");
                setToastMessage(response.error);
                setToastSuccess(false);
                setIsVisibleToast(true);
            }
        } catch (error) {
            console.error("Error generating image:", error);
            setIsGenerating(false);
            setGenerationStatus("");
            setToastMessage("Failed to start image generation");
            setToastSuccess(false);
            setIsVisibleToast(true);
        }
    };

    const handleLeave = () => { 
        if (isGenerating) {
            Vibration.vibrate(FAIL_VIBRATION_PATTERN)
            setToastMessage("Please wait for generation to complete");
            setToastSuccess(false);
            setIsVisibleToast(true);
            return;
        }
        if (mediaUrls.length > 0 || postText.length > 0 || location.length > 0) {
            setIsVisibleConfirm(true);
            return;
        };
        setMediaUrls([]);
        setAiPrompt("");
        setLocation("");
        setPostText("");
        router.back()
    }

    React.useEffect(() => {
        if (params?.urls) {
            try {
                const newUrls = typeof params.urls === 'string' ? JSON.parse(params.urls) : params.urls;
                setMediaUrls(prev => {
                    if (JSON.stringify(newUrls) !== JSON.stringify(prev)) {
                        return newUrls;
                    }
                    return prev;
                });
            } catch (e) {
                console.error("Error parsing URLs:", e);
            }
        }
    }, [params?.urls]);

    React.useEffect(() => {
        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }
        };
    }, []);

    const themedStyles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: height < 700 ? 12 : 16,
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
            fontSize: height < 700 ? 20 : 22,
            fontWeight: '700',
            color: colors.textPrimary,
            letterSpacing: 0.3,
        },
        contentContainer: {
            padding: height < 700 ? 12 : 16,
            paddingBottom: 8,
        },
        flatListContent: {
            width: mediaUrls.length <= 1 ? width - 15 : undefined,
            justifyContent: "center",
            paddingVertical: 8,
            marginTop: 4,
        },
        mediaContainer: {
            width: width * 0.65,
            height: height < 700 ? height * 0.25 : height * 0.3,
            position: "relative",
            marginRight: 12,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: colors.inputBackground,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.1,
            shadowRadius: 8,
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
        cameraCard: {
            width: width * 0.65,
            height: height < 700 ? height * 0.25 : height * 0.3,
            marginRight: 12,
            borderRadius: 16,
            backgroundColor: colors.inputBackground,
            borderWidth: 2,
            borderColor: colors.border,
            borderStyle: 'dashed',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.1,
            shadowRadius: 8,
        },
        cameraIconContainer: {
            width: height < 700 ? 56 : 64,
            height: height < 700 ? 56 : 64,
            borderRadius: height < 700 ? 28 : 32,
            backgroundColor: colorScheme === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(99, 102, 241, 0.1)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12,
        },
        cameraCardText: {
            fontSize: height < 700 ? 14 : 16,
            fontWeight: '600',
            color: colors.textPrimary,
            marginTop: 4,
        },
        inputCard: {
            backgroundColor: colors.cardBackground,
            borderRadius: 16,
            padding: 12,
            marginBottom: 10,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: colorScheme === 'dark' ? 0.3 : 0.05,
            shadowRadius: 6,
            elevation: 2,
        },
        textArea: {
            minHeight: 70,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 14,
            textAlignVertical: 'top',
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.textPrimary,
            lineHeight: 18,
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
            marginBottom: 10,
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
            padding: height < 700 ? 12 : 16,
            paddingBottom: Platform.OS === 'ios' ? (height < 700 ? 20 : 24) : (height < 700 ? 12 : 16),
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        button: {
            padding: height < 700 ? 14 : 16,
            borderRadius: 14,
            alignItems: 'center',
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
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        generationStatusContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 12,
            padding: 12,
            marginTop: 12,
            borderLeftWidth: 3,
            borderLeftColor: colors.accent,
        },
        generationStatusText: {
            color: colors.textPrimary,
            fontSize: 14,
            marginLeft: 10,
            flex: 1,
            fontWeight: '500',
        },
    });

    return (
        <KeyboardAvoidingView 
            style={{ flex: 1, backgroundColor: colors.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <Web3Toast message={toastMessage} visible={isVisibleToast} onHide={() => {setIsVisibleToast(false)}} isSuccess={toastSuccess}/>
            <ConfirmDialog 
                visible={isVisibleConfirm}
                onConfirm={() => {
                    if (isGenerating) {
                        Vibration.vibrate(FAIL_VIBRATION_PATTERN)
                        setToastMessage("Please wait for generation to complete");
                        setToastSuccess(false);
                        setIsVisibleToast(true);
                        return;
                    }
                    setMediaUrls([]);
                    setAiPrompt("");
                    setLocation("");
                    setPostText("");
                    router.back()
                    router.back()
                }}
                onCancel={() => {setIsVisibleConfirm(false)}}
                title="Leave without publish?"
                message="Your post isn't finished yet. Leaving the page will delete your changes."
                confirmLabel="Leave"
                confirmGradient={["red", "red"]}

            />
            <StatusBar 
                backgroundColor={colors.background}
                barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
            />
            
            <View style={themedStyles.header}>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={themedStyles.backButton}
                    onPress={handleLeave}
                >
                    <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={themedStyles.headerText}>New Post</Text>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                <View style={themedStyles.contentContainer}>
                    <View style={{ marginBottom: 5 }}>
                        <Text style={themedStyles.sectionTitle}>Media</Text>
                        <FlatList
                            data={mediaUrls.length > 0 ? mediaUrls : ['camera']}
                            renderItem={({ item, index }) => {
                                if (item === 'camera') {
                                    return (
                                        <TouchableOpacity 
                                            style={themedStyles.cameraCard}
                                            activeOpacity={0.7}
                                            onPress={() => router.navigate("/camera")}
                                        >
                                            <View style={themedStyles.cameraIconContainer}>
                                                <MaterialIcons name="add-a-photo" size={height < 700 ? 28 : 32} color={colors.primary} />
                                            </View>
                                            <Text style={themedStyles.cameraCardText}>Add Media</Text>
                                        </TouchableOpacity>
                                    );
                                }
                                return renderMedia({ item, index: index - 1 });
                            }}
                            keyExtractor={(item, index) => index.toString()}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={themedStyles.flatListContent}
                            onViewableItemsChanged={onViewableItemsChanged}
                            viewabilityConfig={viewabilityConfig}
                        />
                    </View>

                    {/* Sections of inputs data */}
                    <View style={{ marginTop: 12 }}>
                        <Text style={themedStyles.sectionTitle}>Description</Text>
                        <View style={themedStyles.inputCard}>
                            <TextInput
                                style={[themedStyles.textArea, { maxHeight: 70 }]}
                                multiline
                                scrollEnabled={true}
                                textAlignVertical="top"
                                placeholder="What's on your mind?"
                                placeholderTextColor={colors.textSecondary}
                                value={postText}
                                onChangeText={setPostText}
                            />
                            <View style={{position: "absolute", zIndex: 9999, right: 17, bottom: 15}}>
                                <Text style={{color: postText.length < 255 ? colors.accent : "red", fontSize: 12}}>{postText.length}/255</Text>
                            </View>
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
                </View>

                <View style={themedStyles.footer}>
                    <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                        style={[themedStyles.button, themedStyles.publishButton]} 
                        onPress={handlePublish}
                        disabled={isGenerating}
                    >
                        <Text style={themedStyles.buttonText}>
                            {isGenerating ? "Generating..." : "Publish Post"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}