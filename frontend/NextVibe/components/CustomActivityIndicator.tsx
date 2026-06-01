import React from 'react';
import { View, ActivityIndicatorProps, StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

type LoaderSize = 'small' | 'large';

type CustomActivityIndicatorProps = ActivityIndicatorProps & {
    size?: LoaderSize;
};

const SIZES: Record<LoaderSize, number> = {
    small: 36,
    large: 100,
};

const CustomActivityIndicator = ({
    size = 'large',
    style,
    ...props
}: CustomActivityIndicatorProps) => {
    const dimension = SIZES[size];

    return (
        <View style={[{ justifyContent: 'center', alignItems: 'center' }, style as StyleProp<ViewStyle>]}>
            <LottieView
                source={require('../assets/lottie/loader.json')}
                autoPlay
                loop
                style={{ width: dimension, height: dimension }}
            />
        </View>
    );
};

export { CustomActivityIndicator as ActivityIndicator };
export default CustomActivityIndicator;
