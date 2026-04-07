import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('wandermate_token');
    const savedUser = localStorage.getItem('wandermate_user');
    if (savedToken && savedUser) { setToken(savedToken); setUser(JSON.parse(savedUser)); }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: u, token: t } = res.data;
    setUser(u); setToken(t);
    localStorage.setItem('wandermate_token', t);
    localStorage.setItem('wandermate_user', JSON.stringify(u));
    return u;
  };

  const register = async (nameOrForm, email, password, phone, role) => {
    // Accept either full form object OR individual args
    let payload;
    if (typeof nameOrForm === 'object' && nameOrForm !== null && nameOrForm.email) {
      // Form object passed
      payload = nameOrForm;
    } else {
      // Individual args passed (legacy)
      payload = { name: nameOrForm, email, password, phone, role };
    }
    const res = await api.post('/auth/register', payload);
    const { user: u, token: t } = res.data;
    setUser(u); setToken(t);
    localStorage.setItem('wandermate_token', t);
    localStorage.setItem('wandermate_user', JSON.stringify(u));
    return u;
  };

  const updateProfile = async (profileData) => {
    const res = await api.put('/auth/profile', profileData);
    const updatedUser = res.data.user;
    setUser(updatedUser);
    localStorage.setItem('wandermate_user', JSON.stringify(updatedUser));
    return updatedUser;
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const u = res.data.user;
      setUser(u);
      localStorage.setItem('wandermate_user', JSON.stringify(u));
      return u;
    } catch (err) {
      return null;
    }
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('wandermate_token');
    localStorage.removeItem('wandermate_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, updateProfile, refreshUser, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};
