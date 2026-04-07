import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Auto-detect the correct API URL for physical devices vs emulators
function getApiBaseUrl() {
  // If you want to hardcode your LAN IP, uncomment and edit:
  // return 'http://192.168.1.100:5001';

  // For Android emulator, 10.0.2.2 maps to host machine's localhost
  if (Platform.OS === 'android') {
    // Check if running on an emulator or physical device
    // On physical device, use the Expo dev server host IP (your computer's LAN IP)
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost || Constants.manifest2?.extra?.expoGo?.debuggerHost;
    if (debuggerHost) {
      const lanIp = debuggerHost.split(':')[0];
      console.log('Detected LAN IP:', lanIp);
      return 'http://' + lanIp + ':5001';
    }
    return 'http://10.0.2.2:5001'; // Android emulator fallback
  }

  if (Platform.OS === 'ios') {
    // iOS simulator can use localhost, but physical device needs LAN IP
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost || Constants.manifest2?.extra?.expoGo?.debuggerHost;
    if (debuggerHost) {
      const lanIp = debuggerHost.split(':')[0];
      console.log('Detected LAN IP:', lanIp);
      return 'http://' + lanIp + ':5001';
    }
    return 'http://localhost:5001'; // iOS simulator fallback
  }

  return 'http://localhost:5001';
}

const API_BASE_URL = getApiBaseUrl();
console.log('API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL + '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('wandermate_token');
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('wandermate_token');
      await AsyncStorage.removeItem('wandermate_user');
    }
    return Promise.reject(error);
  }
);

export const API_BASE = API_BASE_URL;
export default api;
