import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';

interface Props {
  isP2PActive: boolean;
}

export const P2PStatusBadge: React.FC<Props> = ({ isP2PActive }) => {
  if (!isP2PActive) return null;

  return (
    <View style={styles.container}>
      <Zap size={12} color="#10B981" fill="#10B981" style={{ marginRight: 4 }} />
      <Text style={styles.badgeText}>P2P Direct</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Dank Mono Bold',
  },
});

export default P2PStatusBadge;
