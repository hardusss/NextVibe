import React from 'react';
import { View, Text, StyleSheet } from "react-native";
import FastImage from "react-native-fast-image";
import LottieView from "lottie-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Crown } from "lucide-react-native";

interface AvatarWithFrameProps {
    avatarUrl: string | null;
    size: number;
    invitedCount: number;
    isOg?: boolean;
    ogEdition?: number | null;
}

export const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({
    avatarUrl,
    size,
    invitedCount,
    isOg = false,
    ogEdition = null,
}) => {
    const frameScale = 1.35;
    const frameSize = size * frameScale;

    const renderFrame = () => {
        if (invitedCount >= 10) {
            return (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        width: frameSize,
                        height: frameSize,
                        zIndex: 10,
                    }}
                >
                    <LottieView
                        source={require('@/assets/lottie/MythicFrame.json')}
                        autoPlay
                        loop
                        style={{ width: '100%', height: '100%' }}
                    />
                </View>
            );
        } else if (invitedCount >= 5) {
            return (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        width: frameSize,
                        height: frameSize,
                        zIndex: 10,
                    }}
                >
                    <LottieView
                        source={require('@/assets/lottie/frame.json')}
                        autoPlay
                        loop
                        style={{ width: '100%', height: '100%' }}
                    />
                </View>
            );
        } else if (invitedCount >= 1) {
            return (
                <FastImage
                    source={require('@/assets/frames/BasicFrame.png')}
                    style={{
                        position: 'absolute',
                        width: frameSize - 5,
                        height: frameSize - 8,
                        zIndex: 10,
                        marginTop: -1,
                    }}
                    resizeMode={FastImage.resizeMode.contain}
                    pointerEvents="none"
                />
            );
        }
        return null;
    };

    return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <View style={{ width: '100%', height: '100%', borderRadius: 999, overflow: 'hidden' }}>
                <FastImage
                    style={{ width: '100%', height: '100%' }}
                    source={{ uri: avatarUrl as string }}
                />
            </View>

            {renderFrame()}

            {/*
             * OG edition badge — shown only when the user has minted an OG cNFT.
             * Positioned at the bottom center of the avatar, above the frame layer
             * via zIndex: 20. Uses a purple gradient consistent with the cNFT card design.
             */}
            {isOg && ogEdition !== null && (
                <LinearGradient
                    colors={['#7c3aed', '#a855f7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                        styles.ogBadge,
                        {
                            bottom: -8,
                            // Horizontally centered relative to the avatar
                            left: '50%',
                            transform: [{ translateX: -22 }],
                        },
                    ]}
                >
                    <Crown size={8} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.ogBadgeText}>#{ogEdition}</Text>
                </LinearGradient>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    ogBadge: {
        position: 'absolute',
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 7,
    },
    ogBadgeText: {
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        fontSize: 9,
        includeFontPadding: false,
    },
});