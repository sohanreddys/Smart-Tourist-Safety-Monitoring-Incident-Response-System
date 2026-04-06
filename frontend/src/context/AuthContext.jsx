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

  const register = async (name, email, password, phone, role) => {
    const res = await api.post('/auth/register', { name, email, password, phone, role });
    const { user: u, token: t } = res.data;
    setUser(u); setToken(t);
    localStorage.setItem('wandermate_token', t);
    localStorage.setItem('wandermate_user', JSON.stringify(u));
    return u;
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('wandermate_token');
    localStorage.removeItem('wandermate_user');
  };

  return <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated: !!token }}>{children}</AuthContext.Provider>;
};
