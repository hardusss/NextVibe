import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar, Linking, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useRef, useCallback, useState } from 'react';
import FastImage from 'react-native-fast-image';
import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';

export default function TransactionDetail() {
    const { 
        tx_id, 
        amount, 
        direction, 
        icon, 
        timestamp, 
        to_address, 
        from_address, 
        blockchain, 
        usdValue, 
        tx_url 
    } = useLocalSearchParams();
    
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const isIncoming = direction === 'incoming';
    
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const toastAnimation = useRef(new Animated.Value(0)).current;
    const [toastMessage, setToastMessage] = useState('');

    useFocusEffect(
        useCallback(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 800,
                    delay: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 50,
                    friction: 7,
                    delay: 200,
                    useNativeDriver: true,
                })
            ]).start();
        }, [])
    );

    const showToast = (message: string) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(toastAnimation, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start();
    };

    const handleCopy = (value: string, label: string) => {
        Clipboard.setString(value);
        showToast(`${label} copied!`);
    };

    const formatDate = (ts: string | string[] | undefined) => {
        if (!ts) return 'N/A';
        const timestampNum = Number(ts);
        const timestampMs = timestampNum > 10000000000 ? timestampNum : timestampNum * 1000;
        const date = new Date(timestampMs);
        return date.toLocaleString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const handleOpenURL = async (url: string | string[] | undefined) => {
        if (!url || typeof url !== 'string') return;
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        } else {
            console.error(`Don't know how to open this URL: ${url}`);
        }
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0A0410' : '#F5F5F7',
        },
        scrollContainer: {
            padding: 20,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingBottom: 20,
        },
        backButton: {
            marginRight: 15,
        },
        title: {
            fontSize: 22,
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : '#000',
        },
        statusCard: {
            alignItems: 'center',
            marginBottom: 24,
        },
        statusIconContainer: {
            width: 64,
            height: 64,
            borderRadius: 32,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isIncoming ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
            marginBottom: 16,
        },
        statusIcon: {
            color: isIncoming ? '#2ECC71' : '#E74C3C',
        },
        amount: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 36,
            fontWeight: 'bold',
        },
        usdValue: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 16,
            marginTop: 4,
        },
        detailsCard: {
            backgroundColor: isDark ? '#180F2E' : '#FFFFFF',
            borderRadius: 16,
            padding: 8,
        },
        infoRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 16,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#2A1B41' : '#E0E0E0',
        },
        infoRowLast: {
            borderBottomWidth: 0,
        },
        label: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 14,
        },
        valueContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            justifyContent: 'flex-end',
        },
        value: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 14,
            fontWeight: '500',
            textAlign: 'right',
            marginLeft: 8,
        },
        urlText: {
            color: isDark ? '#A78BFA' : '#5856D6',
            fontSize: 14,
            fontWeight: '600',
        },
        toast: {
            position: 'absolute',
            bottom: 40,
            alignSelf: 'center',
            backgroundColor: '#2ECC71',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 25,
            flexDirection: 'row',
            alignItems: 'center',
            zIndex: 100,
        },
        toastText: {
            color: '#fff',
            fontSize: 14,
            fontWeight: '600',
            marginLeft: 8,
        },
    });

    return (
        <View style={styles.container}>
            <StatusBar 
                backgroundColor={isDark ? "#0A0410" : "#F5F5F7"}
                barStyle={isDark ? "light-content" : "dark-content"}
            />

            <View style={{padding: 20, paddingBottom: 0}}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.push("/transactions")}>
                        <MaterialCommunityIcons name="arrow-left" size={28} color={isDark ? '#FFFFFF' : '#000'} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Transaction Details</Text>
                </View>
            </View>
            
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                <Animated.View style={[styles.statusCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.statusIconContainer}>
                         <FastImage source={{ uri: icon as string }} style={{width: 44, height: 44}} />
                    </View>
                    <Text style={styles.amount}>
                        {isIncoming ? '+' : '-'}{amount} {blockchain?.toString().toUpperCase()}
                    </Text>
                    {usdValue && <Text style={styles.usdValue}>${usdValue}</Text>}
                </Animated.View>

                <Animated.View style={[styles.detailsCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Status</Text>
                        <View style={styles.valueContainer}>
                           <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ECC71'}} />
                           <Text style={[styles.value, { color: '#2ECC71' }]}>Completed</Text>
                        </View>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Date</Text>
                        <Text style={styles.value}>{formatDate(timestamp)}</Text>
                    </View>

                    {from_address && !isIncoming && (
                        <TouchableOpacity style={styles.infoRow} onPress={() => handleCopy(from_address as string, 'From Address')}>
                            <Text style={styles.label}>From</Text>
                            <View style={styles.valueContainer}>
                                <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">{from_address}</Text>
                                <MaterialCommunityIcons name="content-copy" size={16} color={isDark ? '#A09CB8' : '#666'} />
                            </View>
                        </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity style={styles.infoRow} onPress={() => handleCopy(to_address as string, 'To Address')}>
                        <Text style={styles.label}>To</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">{to_address}</Text>
                            <MaterialCommunityIcons name="content-copy" size={16} color={isDark ? '#A09CB8' : '#666'} />
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.infoRow} onPress={() => handleCopy(tx_id as string, 'Transaction ID')}>
                        <Text style={styles.label}>Transaction ID</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">{tx_id}</Text>
                            <MaterialCommunityIcons name="content-copy" size={16} color={isDark ? '#A09CB8' : '#666'} />
                        </View>
                    </TouchableOpacity>

                    {tx_url && (
                        <TouchableOpacity style={[styles.infoRow, styles.infoRowLast]} onPress={() => handleOpenURL(tx_url)}>
                            <Text style={styles.label}>View on Explorer</Text>
                            <View style={styles.valueContainer}>
                                <Text style={styles.urlText}>Open Link</Text>
                                <MaterialCommunityIcons name="open-in-new" size={18} color={isDark ? '#A78BFA' : '#5856D6'} style={{marginLeft: 4}}/>
                            </View>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </ScrollView>

            {toastMessage !== '' && (
                <Animated.View style={[ styles.toast, { opacity: toastAnimation, transform: [{ translateY: toastAnimation.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </Animated.View>
            )}
        </View>
    );
}
