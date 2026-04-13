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
                <View style={{
                    position: 'absolute',
                    bottom: -(size * 0.12),
                    left: 0,
                    right: 0,
                    alignItems: 'center',
                    zIndex: 20,
                }}>
                    <LinearGradient
                        colors={['#7c3aed', '#a855f7']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: size * 0.04,
                            paddingHorizontal: size * 0.08,
                            paddingVertical: size * 0.03,
                            borderRadius: size * 0.1,
                        }}
                    >
                        <Crown size={size * 0.12} color="#fff" strokeWidth={2.5} />
                        <Text style={[styles.ogBadgeText, { fontSize: size * 0.13 }]}>
                            #{ogEdition}
                        </Text>
                    </LinearGradient>
                </View>
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
    },
    ogBadgeText: {
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
});