import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import { ShieldCheck, X, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

interface Props {
  visible: boolean;
  onClose: () => void;
  contactName: string;
  safetyNumber: string;
}

export const SafetyNumberModal: React.FC<Props> = ({ visible, onClose, contactName, safetyNumber }) => {
  const isDark = useColorScheme() === 'dark';

  const handleCopy = () => {
    Clipboard.setStringAsync(safetyNumber.replace(/\s+/g, ''));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={isDark ? 40 : 80} tint="dark" style={StyleSheet.absoluteFillObject} />
        
        <View style={[styles.card, { backgroundColor: isDark ? '#150D22' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconTitle}>
              <ShieldCheck size={22} color="#FF5BA8" style={{ marginRight: 8 }} />
              <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                Safety Number
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={isDark ? '#A09CB8' : '#666666'} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: isDark ? '#A09CB8' : '#666666' }]}>
            Verify end-to-end encryption security with <Text style={{ color: '#FF5BA8', fontWeight: 'bold' }}>{contactName}</Text>.
          </Text>

          {/* QR Code */}
          <View style={styles.qrContainer}>
            <QRCode value={`nextvibe-safety:${safetyNumber.replace(/\s+/g, '')}`} size={140} color="#000000" backgroundColor="#FFFFFF" />
          </View>

          {/* Safety Number Digits Display */}
          <View style={[styles.digitsBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
            <Text style={[styles.digitsText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              {safetyNumber}
            </Text>
          </View>

          {/* Copy Button */}
          <TouchableOpacity style={styles.copyButton} onPress={handleCopy} activeOpacity={0.8}>
            <Copy size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.copyText}>Copy Safety Number</Text>
          </TouchableOpacity>
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
    borderColor: 'rgba(255, 91, 168, 0.3)',
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
    marginBottom: 16,
  },
  digitsText: {
    fontSize: 15,
    fontFamily: 'Dank Mono Bold',
    textAlign: 'center',
    letterSpacing: 1.5,
    lineHeight: 24,
  },
  copyButton: {
    backgroundColor: '#FF5BA8',
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
