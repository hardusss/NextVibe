import React from 'react';
import { ViewStyle, TextStyle } from 'react-native';

interface ButtonWalletSignInProps {
    onSuccess: (backendResponse?: any) => void;
    onError?: (error: any) => void;
    buttonStyle?: ViewStyle;
    textStyle?: TextStyle;
    title?: string;
}

export default function ButtonWalletSignIn({}: ButtonWalletSignInProps) {
    return null;
}