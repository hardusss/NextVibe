import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  StatusBar,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
  Switch,
} from 'react-native';
import { CherryChatWebView } from './CherryChatWebView';
import { buildCherryHostHtml } from './cherryHostHtml';
import { getCherryEmbedToken, getCherryMembers, getCherryMuteStatus, toggleCherryMute } from '@/src/api/chat';
import Header from '../Chat/Header';
import { router } from 'expo-router';
import { Users, Bell, BellOff, X, ShieldCheck } from 'lucide-react-native';

export interface GroupMember {
  user_id: number;
  username: string;
  avatar?: string | null;
  is_online?: boolean;
  wallet_address?: string | null;
}

export default function CherryChatScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isDark = useColorScheme() === 'dark';

  const html = useMemo(
    () => buildCherryHostHtml({ sdkUrl: 'https://embed.cherry.fun/cherry-embed.js' }),
    []
  );

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      try {
        const [freshToken, muteState] = await Promise.all([
          getCherryEmbedToken(),
          getCherryMuteStatus(),
        ]);
        if (isMounted) {
          if (freshToken) setToken(freshToken);
          setIsMuted(muteState);
        }
      } catch (err) {
        console.error('Failed to initialize Cherry screen:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initData();

    return () => {
      isMounted = false;
    };
  }, []);

  const openMembersModal = async () => {
    setModalVisible(true);
    setLoadingMembers(true);
    try {
      const data = await getCherryMembers();
      setMembers(data);
    } catch (err) {
      console.error('Error fetching members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleMuteToggle = async (val: boolean) => {
    setIsMuted(val);
    const updated = await toggleCherryMute(val);
    setIsMuted(updated);
  };

  return (
    <View style={[styles.container, { backgroundColor: '#0F0919' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0919" />
      <Header
        title="NextVibe Community"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        onTitlePress={openMembersModal}
        rightElement={
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openMembersModal}
            style={styles.headerRightButton}
          >
            <Users size={22} color="#FF5BA8" />
          </TouchableOpacity>
        }
      />
      {loading || !token ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF5BA8" />
          <Text style={styles.loadingText}>Connecting to NextVibe Chat...</Text>
        </View>
      ) : (
        <CherryChatWebView
          source={{ html, baseUrl: 'https://embed.cherry.fun' }}
          config={{
            appId: '16e14376-0fce-4536-8891-754fd8fb5748',
            embedUrl: 'https://embed.cherry.fun',
            roomId: '68a27a2f-f26b-4a84-b8d6-55be5cb86122',
            mode: 'external-controlled',
            token,
            theme: { mode: 'dark', primaryColor: '#FF5BA8' },
          }}
          style={styles.webView}
        />
      )}

      {/* Members & Settings Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.groupIconCircle}>
                  <Users size={20} color="#FF5BA8" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>NextVibe Community</Text>
                  <Text style={styles.modalSubTitle}>Public Cherry Group</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <X size={22} color="#E0E0E0" />
              </TouchableOpacity>
            </View>

            {/* Mute Notifications Toggle Card */}
            <View style={styles.settingCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {isMuted ? (
                  <BellOff size={22} color="#EF4444" style={{ marginRight: 12 }} />
                ) : (
                  <Bell size={22} color="#10B981" style={{ marginRight: 12 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Mute Group Notifications</Text>
                  <Text style={styles.settingSubTitle}>
                    {isMuted ? 'Notifications are disabled' : 'Receive push alerts on new messages'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isMuted}
                onValueChange={handleMuteToggle}
                trackColor={{ false: '#374151', true: '#FF5BA8' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Members Section */}
            <View style={{ flex: 1, marginTop: 16 }}>
              <Text style={styles.sectionTitle}>
                Group Members {members.length > 0 ? `(${members.length})` : ''}
              </Text>

              {loadingMembers ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#FF5BA8" />
                </View>
              ) : (
                <FlatList
                  data={members}
                  keyExtractor={(item) => item.user_id.toString()}
                  renderItem={({ item }) => (
                    <View style={styles.memberRow}>
                      <View style={styles.avatarContainer}>
                        {item.avatar ? (
                          <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
                        ) : (
                          <View style={styles.avatarFallback}>
                            <Text style={styles.avatarInitial}>
                              {item.username.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: item.is_online ? '#10B981' : '#6B7280' },
                          ]}
                        />
                      </View>

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.memberName}>{item.username}</Text>
                          <ShieldCheck size={14} color="#FF5BA8" style={{ marginLeft: 4 }} />
                        </View>
                        {item.wallet_address ? (
                          <Text style={styles.memberWallet} numberOfLines={1}>
                            {item.wallet_address.slice(0, 6)}...{item.wallet_address.slice(-4)}
                          </Text>
                        ) : (
                          <Text style={styles.memberWallet}>Member</Text>
                        )}
                      </View>
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0919',
  },
  headerRightButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF5BA822',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF5BA844',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#E0E0E0',
    fontSize: 15,
    fontFamily: 'Dank Mono Bold',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0F0919',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '75%',
    backgroundColor: '#16091F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FF5BA833',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D1A3F',
  },
  groupIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF5BA822',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#FF5BA866',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Dank Mono Bold',
  },
  modalSubTitle: {
    color: '#A0A0B0',
    fontSize: 12,
  },
  closeButton: {
    padding: 6,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#231032',
    padding: 14,
    borderRadius: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#3D1D52',
  },
  settingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Dank Mono Bold',
  },
  settingSubTitle: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  sectionTitle: {
    color: '#FF5BA8',
    fontSize: 14,
    fontFamily: 'Dank Mono Bold',
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#231032',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF5BA833',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF5BA866',
  },
  avatarInitial: {
    color: '#FF5BA8',
    fontSize: 16,
    fontFamily: 'Dank Mono Bold',
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#16091F',
  },
  memberName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Dank Mono Bold',
  },
  memberWallet: {
    color: '#9CA3AF',
    fontSize: 12,
  },
});
