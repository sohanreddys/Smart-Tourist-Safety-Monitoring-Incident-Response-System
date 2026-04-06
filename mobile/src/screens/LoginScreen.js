import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Login Failed', err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>WanderMate</Text>
          <Text style={styles.subtitle}>Explore More — Worry Less</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>

          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
          <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword}
            secureTextEntry placeholderTextColor="#9ca3af" />

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Signing In...' : 'Sign In'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.link}>
            <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Register</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e40af' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  logo: { fontSize: 36, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 16, color: '#93c5fd', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2937', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 14, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#6b7280', fontSize: 14 },
  linkBold: { color: '#2563eb', fontWeight: '600' },
});

export default LoginScreen;
