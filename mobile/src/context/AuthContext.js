import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { collectDeviceInfo } from '../services/deviceInfo';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('wandermate_token');
        const savedUser = await AsyncStorage.getItem('wandermate_user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          const info = await collectDeviceInfo();
          setDeviceInfo(info);
        }
      } catch (e) {
        console.error('Failed to restore auth:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    await AsyncStorage.setItem('wandermate_token', newToken);
    await AsyncStorage.setItem('wandermate_user', JSON.stringify(userData));

    const info = await collectDeviceInfo();
    setDeviceInfo(info);

    try {
      await api.post('/blockchain/log', {
        action: 'DEVICE_LOGIN',
        details: JSON.stringify({
          device: info.device.modelName,
          os: info.device.osName + ' ' + info.device.osVersion,
          battery: info.battery.level + '%',
          network: info.network.type,
          ip: info.network.ipAddress,
          location: info.location ? info.location.lat.toFixed(4) + ', ' + info.location.lng.toFixed(4) : 'unavailable',
        }),
      });
    } catch (e) {}

    return userData;
  };

  const register = async (name, email, password, phone, role) => {
    const res = await api.post('/auth/register', { name, email, password, phone, role });
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    await AsyncStorage.setItem('wandermate_token', newToken);
    await AsyncStorage.setItem('wandermate_user', JSON.stringify(userData));

    const info = await collectDeviceInfo();
    setDeviceInfo(info);

    try { await api.post('/blockchain/digital-id'); } catch (e) {}

    return userData;
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    setDeviceInfo(null);
    await AsyncStorage.removeItem('wandermate_token');
    await AsyncStorage.removeItem('wandermate_user');
  };

  const value = {
    user, token, loading, deviceInfo,
    login, register, logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
