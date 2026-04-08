import React from 'react';
import { View } from "react-native";
import FastImage from "react-native-fast-image";
import LottieView from "lottie-react-native";

interface AvatarWithFrameProps {
    avatarUrl: string | null;
    size: number;
    invitedCount: number;
}

export const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({ avatarUrl, size, invitedCount }) => {
    const frameScale = 1.35; 
    const frameSize = size * frameScale;

    // Helper function to determine which frame to render based on the invite count
    const renderFrame = () => {
        if (invitedCount >= 10) {
            return (
                <View 
                    pointerEvents="none" 
                    style={{
                        position: 'absolute',
                        width: frameSize,
                        height: frameSize,
                        zIndex: 10
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
                        zIndex: 10
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
                        marginTop: -1
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
            
        </View>
    );
};