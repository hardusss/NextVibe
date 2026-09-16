import React, { useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
    useWindowDimensions, StyleProp, ViewStyle, Insets,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ban, MoreHorizontal, MoreVertical } from 'lucide-react-native';

import BlockUserSheet, { BlockTarget } from './BlockUserSheet';
import haptics from '@/src/utils/haptics';

interface Props {
    userId: number;
    username: string;
    /** Runs once the block is saved. Lists already hide the person via the block store. */
    onBlocked?: (userId: number) => void;
    orientation?: 'horizontal' | 'vertical';
    size?: number;
    color?: string;
    style?: StyleProp<ViewStyle>;
    hitSlop?: Insets;
}

type Anchor = { x: number; y: number; width: number; height: number };

const MENU_WIDTH = 160;
const MENU_HEIGHT = 62;
const GAP = 6;

/**
 * "…" button for a person (profile, comment, chat header). Opens the same
 * dropdown look as the post menu, anchored to the button, with Block.
 * The menu lives in a Modal so list rows and clipped headers can't cover it.
 */
export default function UserMenuButton({
    userId,
    username,
    onBlocked,
    orientation = 'horizontal',
    size = 20,
    color = '#E3E3E3',
    style,
    hitSlop = { top: 14, bottom: 14, left: 14, right: 14 },
}: Props) {
    const triggerRef = useRef<View>(null);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const openMenu = () => {
        haptics.impact('light');
        triggerRef.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y, width, height });
        });
    };

    const closeMenu = () => setAnchor(null);

    const handleBlockPress = () => {
        closeMenu();
        // Let the menu fade out before the sheet slides in
        setTimeout(() => setBlockTarget({ userId, username }), 200);
    };

    const Icon = orientation === 'vertical' ? MoreVertical : MoreHorizontal;

    let menuTop = 0;
    let menuRight = 0;
    if (anchor) {
        const below = anchor.y + anchor.height + GAP;
        menuTop = below + MENU_HEIGHT > screenHeight - 24 ? anchor.y - MENU_HEIGHT - GAP : below;
        menuRight = Math.max(8, screenWidth - (anchor.x + anchor.width));
    }

    return (
        <>
            <TouchableOpacity
                ref={triggerRef}
                onPress={openMenu}
                style={style}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="More options"
            >
                <Icon size={size} color={color} />
            </TouchableOpacity>

            <Modal
                visible={anchor !== null}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={closeMenu}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
                <View style={[styles.container, { top: menuTop, right: menuRight }]}>
                    <LinearGradient
                        colors={['#A855F7', '#7C3AED']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.topLine}
                    />
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleBlockPress}
                        style={styles.item}
                    >
                        <View style={[styles.iconBox, { borderColor: '#EF444430', backgroundColor: '#EF444412' }]}>
                            <Ban size={17} color="#FCA5A5" strokeWidth={1.8} />
                        </View>
                        <Text style={styles.label}>Block</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            <BlockUserSheet
                target={blockTarget}
                onClose={() => setBlockTarget(null)}
                onBlocked={onBlocked}
            />
        </>
    );
}

// Same look as components/Shared/Posts/PostsDropdown.tsx
const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        width: MENU_WIDTH,
        backgroundColor: '#110a1e',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        overflow: 'hidden',
    },
    topLine: {
        height: 2,
        width: '100%',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        letterSpacing: 0.1,
        includeFontPadding: false,
        color: '#FCA5A5',
    },
});
