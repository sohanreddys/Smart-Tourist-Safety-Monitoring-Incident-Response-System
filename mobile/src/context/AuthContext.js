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
          device: info.device?.modelName || 'unknown',
          os: (info.device?.osName || '') + ' ' + (info.device?.osVersion || ''),
          battery: (info.battery?.level || 'N/A') + '%',
          network: info.network?.type || 'unknown',
          ip: info.network?.ipAddress || 'unknown',
          location: info.location ? info.location.lat.toFixed(4) + ', ' + info.location.lng.toFixed(4) : 'unavailable',
        }),
      });
    } catch (e) {}

    return userData;
  };

  const register = async (nameOrForm, email, password, phone, role) => {
    // Accept either full form object OR individual args
    let payload;
    if (typeof nameOrForm === 'object' && nameOrForm !== null && nameOrForm.email) {
      // Form object passed
      payload = { ...nameOrForm, role: nameOrForm.role || 'tourist' };
    } else {
      // Individual args passed (legacy)
      payload = { name: nameOrForm, email, password, phone, role: role || 'tourist' };
    }
    const res = await api.post('/auth/register', payload);
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

  const updateProfile = async (profileData) => {
    const res = await api.put('/auth/profile', profileData);
    const updatedUser = res.data.user;
    setUser(updatedUser);
    await AsyncStorage.setItem('wandermate_user', JSON.stringify(updatedUser));
    return updatedUser;
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const u = res.data.user;
      setUser(u);
      await AsyncStorage.setItem('wandermate_user', JSON.stringify(u));
      return u;
    } catch (err) {
      return null;
    }
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
    login, register, updateProfile, refreshUser, logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
