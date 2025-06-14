import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, useColorScheme } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
    isVisible: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

const LogoutConfirmationSheet = ({ isVisible, onClose, onConfirm }: Props) => {
    const isDark = useColorScheme() === 'dark';

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity 
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View 
                    style={[
                        styles.container,
                        { backgroundColor: isDark ? '#1f1f1f' : '#ffffff' }
                    ]}
                >
                    <View style={styles.content}>
                        <MaterialCommunityIcons 
                            name="logout" 
                            size={40} 
                            color={isDark ? "#05f0d8" : "#007bff"} 
                            style={styles.icon}
                        />
                        <Text style={[
                            styles.title,
                            { color: isDark ? '#ffffff' : '#000000' }
                        ]}>
                            Logout Confirmation
                        </Text>
                        <Text style={[
                            styles.message,
                            { color: isDark ? '#cccccc' : '#666666' }
                        ]}>
                            Are you sure you want to log out?
                        </Text>
                        
                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    styles.buttonText,
                                    { color: isDark ? '#ffffff' : '#000000' }
                                ]}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.button, styles.logoutButton]}
                                onPress={onConfirm}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.logoutButtonText}>
                                    Yes, Logout
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    container: {
        width: '90%',
        maxWidth: 400,
        borderRadius: 15,
        overflow: 'hidden',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    content: {
        padding: 20,
        alignItems: 'center'
    },
    icon: {
        marginBottom: 15
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center'
    },
    message: {
        fontSize: 16,
        marginBottom: 20,
        textAlign: 'center'
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 10
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginHorizontal: 5,
        alignItems: 'center',
        justifyContent: 'center'
    },
    cancelButton: {
        backgroundColor: 'rgba(35, 35, 35, 0.99)'
    },
    logoutButton: {
        backgroundColor: '#ff4444'
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600'
    },
    logoutButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600'
    }
});

export default LogoutConfirmationSheet;