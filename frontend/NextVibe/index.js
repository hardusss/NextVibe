import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'text-encoding'; 

import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import './polyfill';


import 'expo-router/entry';