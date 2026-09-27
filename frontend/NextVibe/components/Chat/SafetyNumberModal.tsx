import React, { useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, Modal, TouchableOpacity, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import { ShieldAlert, ShieldCheck, X, Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import type { SafetyState } from '@/src/services/CryptoService';
import { chatColors } from '@/src/theme/chatTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  contactName: string;
  /** null while the keys load */
  state: SafetyState | null;
}

/**
 * The safety number of this chat: 60 digits made from both people's device
 * keys (CryptoService.safetyNumber). If it's the same on both phones, the
 * messages are sealed for your devices only.
 */
export const SafetyNumberModal: React.FC<Props> = ({ visible, onClose, contactName, state }) => {
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const [copied, setCopied] = useState(false);
  const number = state?.status === 'ready' ? state.number : null;

  const handleCopy = () => {
    if (!number) return;
    Clipboard.setStringAsync(number.replace(/\s+/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderBody = () => {
    if (!state) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    if (state.status === 'legacy' || state.status === 'offline') {
      return (
        <View style={[styles.notice, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
          <ShieldAlert size={20} color={colors.subtext} style={{ marginBottom: 8 }} />
          <Text style={[styles.noticeText, { color: colors.text }]}>
            {state.status === 'legacy'
              ? `${contactName}'s app doesn't have end-to-end encryption yet. Messages use the older format until they update NextVibe; then a safety number shows here.`
              : "Couldn't load the encryption keys. Check your connection and open this again."}
          </Text>
        </View>
      );
    }
    return (
      <>
        <View style={styles.qrContainer}>
          <QRCode value={`nextvibe-safety:${state.number.replace(/\s+/g, '')}`} size={140} color="#000000" backgroundColor="#FFFFFF" />
        </View>
        <View style={[styles.digitsBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
          <Text style={[styles.digitsText, { color: colors.text }]}>{state.number}</Text>
        </View>
        <Text style={[styles.hint, { color: colors.subtext }]}>
          Compare it in person or scan each other's code. The number changes when either of you adds a phone.
        </Text>
        <TouchableOpacity style={[styles.copyButton, { backgroundColor: colors.accent }]} onPress={handleCopy} activeOpacity={0.8}>
          {copied
            ? <Check size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            : <Copy size={16} color="#FFFFFF" style={{ marginRight: 6 }} />}
          <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy safety number'}</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={isDark ? 40 : 80} tint="dark" style={StyleSheet.absoluteFillObject} />

        <View style={[styles.card, { backgroundColor: isDark ? '#150D22' : '#FFFFFF', borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={styles.iconTitle}>
              <ShieldCheck size={22} color={colors.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.title, { color: colors.text }]}>Safety number</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close">
              <X size={20} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          {(!state || state.status === 'ready') && (
            <Text style={[styles.subtitle, { color: colors.subtext }]}>
              Messages with <Text style={{ color: colors.accent, fontFamily: 'Dank Mono Bold' }}>{contactName}</Text> are
              end-to-end encrypted: only your phones can read them.
            </Text>
          )}

          {renderBody()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Dank Mono Bold',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Dank Mono',
    marginBottom: 16,
    lineHeight: 18,
  },
  center: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  noticeText: {
    fontSize: 14,
    fontFamily: 'Dank Mono',
    lineHeight: 20,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 16,
  },
  digitsBox: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  digitsText: {
    fontSize: 15,
    fontFamily: 'Dank Mono Bold',
    textAlign: 'center',
    letterSpacing: 1.5,
    lineHeight: 24,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Dank Mono',
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 14,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
  copyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Dank Mono Bold',
  },
});

export default SafetyNumberModal;
