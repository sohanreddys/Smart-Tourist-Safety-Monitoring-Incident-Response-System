import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// IMPORTANT: Change this to your computer's local IP when testing on a real device
// e.g., 'http://192.168.1.100:5001'
const API_BASE_URL = 'http://localhost:5001';

const api = axios.create({
  baseURL: API_BASE_URL + '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
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
