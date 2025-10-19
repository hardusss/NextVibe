import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, useColorScheme, ActivityIndicator } from 'react-native';
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

export default function ReportPostModal({ postId, visible, onClose }: { postId: number; visible: boolean; onClose: (reported?: boolean, message?: string) => void; }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selected, setSelected] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    // Reset when modal opens to ensure UI shows categories correctly
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
  }

  const startSend = () => {
    // Show confirm dialog
    setConfirmVisible(true);
  }

  const sendReport = async () => {
    setConfirmVisible(false);
    setLoading(true);
    try {
      const res = await reportPost(postId, selected as string, description || undefined);
      setLoading(false);
      const status = (res && (res as any).status) || ((res && (res as any).status_code) as number) || null;
      // Display messages from backend: prefer response.data on success, response.error on failure
      const successMessage = res && (res as any).data.data ? (typeof (res as any).data === 'string' ? (res as any).data : ((res as any).data.message || (res as any).data.detail || JSON.stringify((res as any).data))) : null;
      const errorMessage = res && (res as any).error ? ((res as any).error && (res as any).error.message) || (res as any).error : null;

      if (status === 200 || status === 201 || successMessage) {
        const msg = successMessage.data || 'Report submitted';
        onClose(true, msg as string);
        reset();
      } else {
        const msg = errorMessage || 'Unable to send report';
        onClose(false, msg as string);
      }
    } catch (err) {
      setLoading(false);
      const msg = (err && (err as any).message) || 'Unable to send report';
      onClose(false, msg as string);
    }
  };

  const handleNext = () => {
    if (!selected) return;
    setStep(2);
  }

  const handleClose = () => {
    reset();
    onClose(false);
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade">
        <View style={[styles.backdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
          <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: isDark ? '#F3F4F6' : '#0F172A' }]}>Report post</Text>
            </View>
            <Text style={[styles.subtitle, { color: isDark ? '#D1D5DB' : '#6B7280' }]}>Don't worry — the post author will not see who reported this.</Text>

            {step === 1 && (
              <View style={styles.optionsContainer}>
                {REPORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.option, selected === opt.key && (isDark ? styles.optionSelectedDark : styles.optionSelectedLight)]}
                    onPress={() => setSelected(opt.key)}
                  >
                    <Text style={[styles.optionText, { color: isDark ? '#E5E7EB' : '#0F172A' }, selected === opt.key && styles.optionTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={handleClose} style={styles.ghostButton}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleNext} disabled={!selected} style={[styles.primaryButton, !selected && styles.disabledButton]}>
                    <Text style={styles.primaryText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.optionsContainer}>
                <Text style={[styles.sectionTitle, { color: isDark ? '#F3F4F6' : '#0F172A' }]}>Details (optional)</Text>
                <TextInput
                  placeholder="Add an optional description"
                  placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                  value={description}
                  onChangeText={setDescription}
                  style={[styles.textInput, {color: isDark ? "white" : "black"}, isDark ? styles.textInputDark : styles.textInputLight]}
                  multiline
                />

                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={() => setStep(1)} style={styles.ghostButton}>
                    <Text style={styles.ghostText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={startSend} disabled={loading} style={[styles.primaryButton, loading && styles.disabledButton]}>
                    {loading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Send report</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <ConfirmDialog
              visible={confirmVisible}
              onConfirm={sendReport}
              onCancel={() => setConfirmVisible(false)}
              title={`Report post as ${selected ? REPORT_OPTIONS.find(r => r.key === selected)?.label : ''}?`}
              message={`Are you sure you want to report this post${selected ? ` as ${REPORT_OPTIONS.find(r => r.key === selected)?.label}` : ''}? This report is anonymous.`}
              confirmLabel="Report"
              cancelLabel="Cancel"
              confirmGradient={["#7C3AED", "#6D28D9"]}
              iconName="flag"
              iconColor="#C4B5FD"
            />
          </View>
        </View>
      </Modal>
      
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '96%',
    maxWidth: 720,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardDark: {
    backgroundColor: 'rgba(10, 4, 16, 0.98)',
    borderColor: 'rgba(139,92,246,0.12)',
    shadowColor: '#000'
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  optionsContainer: {
    marginTop: 8,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 8,
  },
  optionSelectedLight: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1'
  },
  optionSelectedDark: {
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderColor: 'rgba(99,102,241,0.3)'
  },
  optionText: {
    fontSize: 15,
  },
  optionTextSelected: {
    color: '#3730a3',
    fontWeight: '700'
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  ghostButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  ghostText: {
    color: '#6B7280',
    fontWeight: '600'
  },
  primaryButton: {
    backgroundColor: '#6D28D9',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  disabledButton: {
    opacity: 0.5,
  },
  textInput: {
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
    textAlignVertical: 'top'
  },
  textInputLight: {
    backgroundColor: '#FAFAFB',
    borderColor: 'rgba(0,0,0,0.06)'
  },
  textInputDark: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.04)'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  }
});
