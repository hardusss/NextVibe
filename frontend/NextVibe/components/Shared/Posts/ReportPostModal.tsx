import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Flag, ChevronLeft } from 'lucide-react-native';
import reportPost from '@/src/api/report.post';
import ConfirmDialog from '../Toasts/ConfirmDialog';

const REPORT_OPTIONS = [
    { key: 'spam', label: 'Spam' },
    { key: 'nudity', label: 'Nudity / Sexual Content' },
    { key: 'violence', label: 'Violence / Threats' },
    { key: 'hate_speech', label: 'Hate Speech' },
    { key: 'scam', label: 'Scam / Fraud' },
    { key: 'illegal_activity', label: 'Illegal Activity' },
    { key: 'other', label: 'Other' },
];

export default function ReportPostModal({ postId, visible, onClose }: {
    postId: number;
    visible: boolean;
    onClose: (reported?: boolean, message?: string) => void;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [confirmVisible, setConfirmVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            setSelected(null);
            setDescription('');
            setStep(1);
            setLoading(false);
            setConfirmVisible(false);
        }
    }, [visible]);

    const reset = () => {
        setSelected(null);
        setDescription('');
        setStep(1);
        setLoading(false);
        setConfirmVisible(false);
    };

    const sendReport = async () => {
        setConfirmVisible(false);
        setLoading(true);
        try {
            const res = await reportPost(postId, selected as string, description || undefined);
            setLoading(false);
            const status = (res as any)?.status || (res as any)?.status_code || null;
            const successMessage = (res as any)?.data
                ? (typeof (res as any).data === 'string' ? (res as any).data : ((res as any).data.message || (res as any).data.detail))
                : null;
            const errorMessage = (res as any)?.error?.message || (res as any)?.error || null;

            if (status === 200 || status === 201 || successMessage) {
                onClose(true, successMessage?.data || 'Report submitted');
                reset();
            } else {
                onClose(false, errorMessage || 'Unable to send report');
            }
        } catch (err) {
            setLoading(false);
            onClose(false, (err as any)?.message || 'Unable to send report');
        }
    };

    const handleClose = () => { reset(); onClose(false); };

    return (
        <>
            <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

                <View style={styles.center} pointerEvents="box-none">
                    <View style={styles.card}>
                        {/* Top purple line */}
                        <LinearGradient
                            colors={['#A855F7', '#7C3AED']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.topLine}
                        />

                        {/* Close */}
                        <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                            <X size={16} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.iconRing}>
                                <LinearGradient colors={['#A855F722', '#7C3AED11']} style={styles.iconBg}>
                                    <Flag size={22} color="#C4B5FD" strokeWidth={1.8} />
                                </LinearGradient>
                            </View>
                            <Text style={styles.title}>Report Post</Text>
                            <Text style={styles.subtitle}>The author won't know who submitted this report.</Text>
                        </View>

                        {step === 1 && (
                            <View>
                                {REPORT_OPTIONS.map(opt => (
                                    <TouchableOpacity
                                        key={opt.key}
                                        style={[styles.option, selected === opt.key && styles.optionSelected]}
                                        onPress={() => setSelected(opt.key)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.optionText, selected === opt.key && styles.optionTextSelected]}>
                                            {opt.label}
                                        </Text>
                                        {selected === opt.key && (
                                            <View style={styles.optionDot} />
                                        )}
                                    </TouchableOpacity>
                                ))}

                                <View style={styles.actions}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
                                        <Text style={styles.cancelLabel}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.primaryBtn, !selected && styles.disabled]}
                                        onPress={() => selected && setStep(2)}
                                        activeOpacity={0.8}
                                        disabled={!selected}
                                    >
                                        <LinearGradient
                                            colors={selected ? ['#A855F7', '#7C3AED'] : ['#2a2a2a', '#2a2a2a']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.primaryGradient}
                                        >
                                            <Text style={[styles.primaryLabel, !selected && styles.primaryLabelDisabled]}>Next</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {step === 2 && (
                            <View>
                                <Text style={styles.detailsTitle}>Additional details</Text>
                                <Text style={styles.detailsHint}>Optional — helps us review faster</Text>
                                <TextInput
                                    placeholder="Describe the issue..."
                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                    value={description}
                                    onChangeText={setDescription}
                                    style={styles.textInput}
                                    multiline
                                    textAlignVertical="top"
                                    maxLength={500}
                                />

                                <View style={styles.actions}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
                                        <ChevronLeft size={14} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                                        <Text style={styles.cancelLabel}>Back</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.primaryBtn, loading && styles.disabled]}
                                        onPress={() => setConfirmVisible(true)}
                                        activeOpacity={0.8}
                                        disabled={loading}
                                    >
                                        <LinearGradient
                                            colors={['#A855F7', '#7C3AED']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.primaryGradient}
                                        >
                                            {loading
                                                ? <ActivityIndicator color="#fff" size="small" />
                                                : <Text style={styles.primaryLabel}>Send report</Text>
                                            }
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            <ConfirmDialog
                visible={confirmVisible}
                onConfirm={sendReport}
                onCancel={() => setConfirmVisible(false)}
                title={`Report as ${REPORT_OPTIONS.find(r => r.key === selected)?.label ?? ''}?`}
                message="This report is anonymous. Are you sure you want to submit it?"
                confirmLabel="Report"
                cancelLabel="Cancel"
                confirmGradient={["#A855F7", "#7C3AED"]}
                iconName="flag"
                iconColor="#C4B5FD"
            />
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.65)',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#110a1e',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        overflow: 'hidden',
    },
    topLine: {
        height: 2,
        width: '100%',
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 10,
    },
    header: {
        alignItems: 'center',
        paddingTop: 24,
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    iconRing: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.3)',
        overflow: 'hidden',
        marginBottom: 14,
    },
    iconBg: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        marginBottom: 6,
        letterSpacing: 0.2,
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
        lineHeight: 18,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 20,
        marginBottom: 6,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    optionSelected: {
        borderColor: 'rgba(168,85,247,0.4)',
        backgroundColor: 'rgba(168,85,247,0.1)',
    },
    optionText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    optionTextSelected: {
        color: '#C4B5FD',
        fontFamily: 'Dank Mono Bold',
    },
    optionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#A855F7',
    },
    detailsTitle: {
        fontSize: 15,
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        marginHorizontal: 20,
        marginTop: 4,
        marginBottom: 4,
    },
    detailsHint: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        marginHorizontal: 20,
        marginBottom: 10,
    },
    textInput: {
        minHeight: 90,
        marginHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        backgroundColor: 'rgba(168,85,247,0.05)',
        padding: 14,
        color: '#fff',
        fontSize: 14,
        lineHeight: 20,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24,
        gap: 10,
    },
    cancelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: 'rgba(168,85,247,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.15)',
    },
    cancelLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'Dank Mono Bold',
    },
    primaryBtn: {
        flex: 1,
        height: 44,
        borderRadius: 10,
        overflow: 'hidden',
    },
    primaryGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryLabel: {
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
    },
    primaryLabelDisabled: {
        color: 'rgba(255,255,255,0.3)',
    },
    disabled: {
        opacity: 0.5,
    },
});