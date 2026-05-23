import React from "react";
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AntDesign, MaterialIcons } from "@expo/vector-icons";
import FastImage from "react-native-fast-image";
import { EdgeInsets } from "react-native-safe-area-context";
import { Comment, Reply } from "./CommentThread";

interface Theme {
    background: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    inputBg: string;
}

interface Props {
    avatarUrl: string | null | undefined;
    commentText: string;
    onChangeText: (text: string) => void;
    onSend: () => void;
    replyingTo: Comment | Reply | null;
    onCancelReply: () => void;
    postAuthor: string | null;
    insets: EdgeInsets;
    theme: Theme;
}

const CommentInput: React.FC<Props> = ({
    avatarUrl, commentText, onChangeText, onSend,
    replyingTo, onCancelReply, postAuthor, insets, theme,
}) => {
    const canSend = commentText.trim().length > 0;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={insets.bottom}
        >
            {replyingTo && (
                <View style={[s.replyBar, { backgroundColor: theme.background, borderTopColor: "rgba(168,85,247,0.12)" }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                        Replying to <Text style={{ color: "#A855F7" }}>{replyingTo.user.username}</Text>
                    </Text>
                    <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <AntDesign name="close" size={14} color="#888" />
                    </TouchableOpacity>
                </View>
            )}

            <View style={[
                s.bar,
                {
                    backgroundColor: theme.background,
                    borderTopColor: theme.border,
                    paddingBottom: Math.max(insets.bottom, 12),
                },
            ]}>
                <FastImage source={{ uri: avatarUrl ?? undefined }} style={s.avatar} />

                <View style={[s.inputWrap, { backgroundColor: theme.inputBg }]}>
                    <TextInput
                        value={commentText}
                        onChangeText={onChangeText}
                        placeholder={`Reply to ${postAuthor ?? "post"}…`}
                        placeholderTextColor="#555"
                        style={[s.input, { color: theme.textPrimary }]}
                        returnKeyType="send"
                        onSubmitEditing={onSend}
                        multiline
                        maxLength={500}
                    />
                </View>

                <TouchableOpacity onPress={onSend} disabled={!canSend} style={[s.sendBtn, !canSend && { opacity: 0.35 }]}>
                    <LinearGradient
                        colors={canSend ? ["#A855F7", "#7C3AED"] : ["#1a1a1a", "#1a1a1a"]}
                        style={s.sendGradient}
                    >
                        <MaterialIcons name="arrow-upward" size={18} color={canSend ? "#fff" : "#444"} />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const s = StyleSheet.create({
    replyBar: {
        flexDirection: "row", 
        justifyContent: "space-between", 
        alignItems: "center",
        paddingHorizontal: 14, 
        paddingVertical: 7,
        backgroundColor: "rgba(168,85,247,0.06)",
        borderTopWidth: 1,
    },
    bar: {
        flexDirection: "row", 
        alignItems: "center", 
        gap: 10,
        paddingHorizontal: 14, 
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    avatar: {
        width: 32, 
        height: 32, 
        borderRadius: 16, 
        backgroundColor: "#1a1a1a"
     },
    inputWrap: {
        flex: 1, 
        borderRadius: 22, 
        borderWidth: 1,
        borderColor: "rgba(168,85,247,0.25)",
        paddingHorizontal: 14, 
        minHeight: 40, 
        justifyContent: "center",
    },
    input: {
        fontSize: 14, 
        maxHeight: 90 },
    sendBtn: {
        width: 36, 
        height: 36, 
        borderRadius: 18, 
        overflow: "hidden"
     },
    sendGradient: {
        flex: 1, 
        justifyContent: "center", 
        alignItems: "center"
     },
});

export default CommentInput;