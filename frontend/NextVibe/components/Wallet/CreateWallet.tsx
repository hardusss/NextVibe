import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, ActivityIndicator, Switch } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createWallet from '../../src/api/create.wallet';
import { Ionicons } from '@expo/vector-icons';

const steps = [
  'Checking existing wallet',
  'Generating keys',
  'Creating wallet',
  'Saving data'
];

export default function CreateWallet() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [checkingWallet, setCheckingWallet] = useState(true);
  const progressWidth = new Animated.Value(0);
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  useFocusEffect(useCallback(() => {
    checkWallet();
  }, []));

  const checkWallet = async () => {
    try {
      const wallet = await AsyncStorage.getItem('wallet');
      if (wallet === 'true') {
        router.push('/wallet');
      } else {
        setCheckingWallet(false);
        startWalletCreation();
      }
    } catch (error) {
      console.error('Error checking wallet:', error);
      setCheckingWallet(false);
      startWalletCreation();
    }
  };

  const startWalletCreation = async () => {
    try {
      for (let i = 0; i < steps.length; i++) {
        setActiveStep(i);
        Animated.timing(progressWidth, {
          toValue: ((i + 1) / steps.length) * 100,
          duration: 1500,
          useNativeDriver: false,
        }).start();

        if (i === 2) {
          await createWallet();
        } else {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      await AsyncStorage.setItem('wallet', 'true');
      router.push('/wallet');
    } catch (error) {
      console.error('Error creating wallet:', error);
    }
  };

  const width = progressWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const theme = isDarkTheme ? darkTheme : lightTheme;

  if (checkingWallet) {
    return (
      <View style={[styles.container, theme.container]}>
        <Ionicons name="wallet-outline" size={60} color={theme.accent} />
        <Text style={[theme.text, { marginTop: 20 }]}>Entering wallet...</Text>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, theme.container]}>
      <View style={styles.switchContainer}>
        <Text style={theme.text}>Theme: {isDarkTheme ? 'Dark' : 'Light'}</Text>
        <Switch
          value={isDarkTheme}
          onValueChange={() => setIsDarkTheme(!isDarkTheme)}
          thumbColor={isDarkTheme ? '#00bcd4' : '#00bcd4'}
          trackColor={{ false: '#ccc', true: '#333' }}
        />
      </View>

      <Ionicons name="wallet-outline" size={80} color={theme.accent} style={{ marginBottom: 20 }} />

      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, { width, backgroundColor: theme.accent }]} />
      </View>

      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={[
              styles.stepCircle,
              { backgroundColor: activeStep >= index ? theme.accent : theme.circle }
            ]}>
              {activeStep > index && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.stepText, theme.text]}>{step}</Text>
          </View>
        ))}
      </View>

      <ActivityIndicator size="large" color={theme.accent} style={styles.spinner} />
      <Text style={[styles.currentStep, theme.text]}>{steps[activeStep]}</Text>
      <Text style={[styles.waitText, theme.text]}>
        Please wait. This may take a few minutes...
      </Text>
    </View>
  );
}

const darkTheme = {
  container: { backgroundColor: '#000' },
  text: { color: '#00bcd4' },
  accent: '#00bcd4',
  circle: '#333',
};

const lightTheme = {
  container: { backgroundColor: '#fff' },
  text: { color: '#00bcd4' },
  accent: '#00bcd4',
  circle: '#e0e0e0',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    top: 50,
    right: 20,
  },
  progressContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 30,
  },
  progressBar: {
    height: '100%',
  },
  stepsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  step: {
    alignItems: 'center',
    width: Dimensions.get('window').width / 5,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkmark: {
    color: 'white',
    fontSize: 16,
  },
  stepText: {
    fontSize: 12,
    textAlign: 'center',
  },
  spinner: {
    marginVertical: 20,
  },
  currentStep: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  waitText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
