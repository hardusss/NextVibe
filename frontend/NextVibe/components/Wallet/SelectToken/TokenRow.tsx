import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import FastImage from 'react-native-fast-image';
import { BlurView } from 'expo-blur';

interface TokenRowProps {
    item: { name: string; symbol: string; icon: string };
    onPress: () => void;
    isDark: boolean;
    styles: any;
}

export const TokenRow = ({ item, onPress, isDark, styles }: TokenRowProps) => {
    return (
        <TouchableOpacity
            style={styles.tokenItem}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <BlurView
                intensity={isDark ? 30 : 90}
                tint={isDark ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
            />
            <View style={styles.tokenItemContent}>
                <View style={styles.tokenInfo}>
                    <FastImage
                        source={{ uri: item.icon }}
                        style={styles.tokenImage}
                        resizeMode={FastImage.resizeMode.cover}
                    />
                    <View style={styles.tokenTextWrapper}>
                        <Text style={styles.tokenName}>{item.symbol}</Text>
                        <Text style={styles.tokenSymbol}>{item.name}</Text>
                    </View>
                </View>
                <MaterialCommunityIcons 
                    name="chevron-right" 
                    size={28} 
                    style={styles.arrowIcon} 
                />
            </View>
        </TouchableOpacity>
    );
};

export const TokenSkeleton = ({ styles }: { styles: any }) => (
    <View style={styles.skeletonRow}>
        <View style={styles.skeletonCircle} />
        <View style={styles.skeletonTextBlock}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineLong} />
        </View>
    </View>
);