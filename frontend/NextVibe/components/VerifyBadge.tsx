import { Pressable, Animated, Easing, View, Text, StyleSheet, Modal } from "react-native";
import { BlurView } from "expo-blur";
import LottieView from "lottie-react-native";
import { useState, useEffect, useRef } from "react";

interface PropsVerifyBadge {
    isLooped: boolean;
    isVisible: boolean;
    haveModal: boolean;
    isStatic: boolean;
    size: number;
};

export default function VerifyBadge ({ isLooped, isVisible, haveModal, isStatic, size }: PropsVerifyBadge) {
    const [showVerifiedToast, setShowVerifiedToast] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const lottieRef = useRef<LottieView>(null);

    useEffect(() => {
        if (showVerifiedToast) {
            setModalVisible(true);
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 5,
                    tension: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: 0.8,
                    duration: 150,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setModalVisible(false);
                scaleAnim.setValue(0);
            });
        }
    }, [showVerifiedToast]);
    
    useEffect(() => {
        const lottie = lottieRef.current;
        if (!lottie) return;

        // static = ever freeze
        if (isStatic) {
            lottie.play(110, 110);
            return;
        }

        // if not visible = stop
        if (!isVisible) {
            lottie.play(110, 110);
            return;
        }

        // visible
        if (isLooped) {
            lottie.play(); // countined or start
        }
    }, [isVisible, isStatic, isLooped]);


    const onPressVerified = () => {
        setShowVerifiedToast(true);
    };

    const closeModal = () => {
        setShowVerifiedToast(false);
    };
    
    return (
        <>
        <Pressable 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => {
                if (!haveModal) return;
                onPressVerified();
            }}
        >
            <LottieView
                ref={lottieRef}
                cacheComposition
                speed={0.5}
                source={require('@/assets/lottie/verified.json')}
                autoPlay={!isStatic && isVisible}   // only when visible
                loop={false}
                progress={isStatic ? 1 : undefined}
                style={{ width: size, height: size }}
                onAnimationFinish={
                    !isStatic && isLooped
                    ? () => {
                        if (isVisible) {
                            lottieRef.current?.play(30, 110);
                        }
                        }
                    : undefined
                }
                />


        </Pressable>

        <Modal
            visible={modalVisible}
            transparent={true}
            animationType="none"
            statusBarTranslucent
            onRequestClose={closeModal}
        >
            <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                <BlurView
                    intensity={100}
                    tint="dark"
                    style={styles.blurContainer}
                >
                    <Pressable 
                        style={styles.backdrop}
                        onPress={closeModal}
                    >
                        <View style={styles.darkOverlay} />
                    </Pressable>
                    
                    <Animated.View
                        style={[
                            styles.modalCard,
                            {
                                transform: [{ scale: scaleAnim }],
                            }
                        ]}
                    >
                        {/* Close button */}
                        <Pressable 
                            style={styles.closeButton}
                            onPress={closeModal}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Text style={styles.closeIcon}>✕</Text>
                        </Pressable>

                        {/* Animated checkmark icon */}
                        <View style={styles.iconCircle}>
                            <LottieView
                                speed={0.7}
                                progress={1}
                                source={require('@/assets/lottie/verified.json')}
                                autoPlay
                                loop={false}
                                style={{ width: 56, height: 56 }}
                            />
                        </View>
                        
                        <Text style={styles.mainTitle}>Verified Account</Text>
                        
                        <View style={styles.divider} />
                        
                        <Text style={styles.description}>
                            This account has been verified by the{"\n"}
                            <Text style={styles.brandHighlight}>NextVibe</Text> team
                        </Text>
                        
                        <View style={styles.badgeContainer}>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>✓</Text>
                                <Text style={styles.badgeLabel}>OFFICIAL</Text>
                            </View>
                        </View>
                    </Animated.View>
                </BlurView>
            </Animated.View>
        </Modal>
        </>
    )
}

const styles = StyleSheet.create({
    blurContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    modalCard: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        borderRadius: 32,
        padding: 36,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(163, 100, 245, 0.3)',
        overflow: 'visible',
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 20,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    closeIcon: {
        fontSize: 18,
        color: 'rgba(255, 255, 255, 0.8)',
        fontWeight: '600',
        lineHeight: 18,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(163, 100, 245, 0.15)',
        borderWidth: 2,
        borderColor: '#a364f5',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        overflow: 'hidden',
    },
    mainTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: 16,
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    divider: {
        width: 60,
        height: 3,
        backgroundColor: '#a364f5',
        borderRadius: 2,
        marginBottom: 20,
    },
    description: {
        fontSize: 15,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.75)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    brandHighlight: {
        color: '#a364f5',
        fontWeight: '800',
        fontSize: 16,
    },
    badgeContainer: {
        marginTop: 8,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(163, 100, 245, 0.2)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(163, 100, 245, 0.4)',
        gap: 8,
    },
    badgeText: {
        fontSize: 16,
        color: '#a364f5',
        fontWeight: '900',
    },
    badgeLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: '#a364f5',
        letterSpacing: 1.5,
    },
});