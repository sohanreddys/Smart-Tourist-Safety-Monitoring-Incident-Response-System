import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { collectDeviceInfo } from '../services/deviceInfo';
import api from '../services/api';

const ProfileScreen = () => {
  const { user, deviceInfo, logout } = useAuth();
  const [digitalId, setDigitalId] = useState(null);
  const [freshDeviceInfo, setFreshDeviceInfo] = useState(deviceInfo);

  useEffect(() => { loadDigitalId(); }, []);

  const loadDigitalId = async () => {
    try { const res = await api.post('/blockchain/digital-id'); setDigitalId(res.data.digitalId); } catch (e) {}
  };

  const refreshDeviceInfo = async () => {
    const info = await collectDeviceInfo();
    setFreshDeviceInfo(info);
    Alert.alert('Refreshed', 'Device information updated.');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const info = freshDeviceInfo || deviceInfo;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
        </View>
      </View>

      {digitalId && (
        <View style={styles.idCard}>
          <Text style={styles.sectionLabel}>BLOCKCHAIN DIGITAL ID</Text>
          <Text style={styles.idName}>{digitalId.userName}</Text>
          <Text style={styles.idEmail}>{digitalId.userEmail}</Text>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Block #</Text>
            <Text style={styles.idValue}>{digitalId.index}</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Hash</Text>
            <Text style={styles.idHash}>{digitalId.hash?.substring(0, 24)}...</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Issued</Text>
            <Text style={styles.idValue}>{new Date(digitalId.issuedAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Device Details</Text>
          <TouchableOpacity onPress={refreshDeviceInfo}>
            <Text style={styles.refreshBtn}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {info?.device && (
          <View style={styles.infoCard}>
            <InfoRow label="Device" value={info.device.brand + ' ' + info.device.modelName} />
            <InfoRow label="OS" value={info.device.osName + ' ' + info.device.osVersion} />
            <InfoRow label="Device Name" value={info.device.deviceName || 'N/A'} />
            <InfoRow label="Physical Device" value={info.device.isDevice ? 'Yes' : 'No (Emulator)'} />
          </View>
        )}

        {info?.battery && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Battery</Text>
            <InfoRow label="Level" value={info.battery.level != null ? info.battery.level + '%' : 'N/A'} />
            <InfoRow label="Charging" value={info.battery.charging ? 'Yes' : 'No'} />
          </View>
        )}

        {info?.network && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Network</Text>
            <InfoRow label="Connected" value={info.network.isConnected ? 'Yes' : 'No'} />
            <InfoRow label="Type" value={info.network.type || 'N/A'} />
            <InfoRow label="IP Address" value={info.network.ipAddress || 'N/A'} />
          </View>
        )}

        {info?.location && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Location</Text>
            <InfoRow label="Latitude" value={info.location.lat?.toFixed(6)} />
            <InfoRow label="Longitude" value={info.location.lng?.toFixed(6)} />
            <InfoRow label="Altitude" value={info.location.altitude ? Math.round(info.location.altitude) + 'm' : 'N/A'} />
            <InfoRow label="Accuracy" value={'±' + Math.round(info.location.accuracy || 0) + 'm'} />
            <InfoRow label="Speed" value={info.location.speed ? (info.location.speed * 3.6).toFixed(1) + ' km/h' : 'Stationary'} />
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>WanderMate v1.0 — Team WanderBytes</Text>
    </ScrollView>
  );
};

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { padding: 16, paddingBottom: 40 },
  userCard: { backgroundColor: '#1e40af', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 22, fontWeight: '700', color: '#fff' },
  userEmail: { fontSize: 14, color: '#93c5fd', marginTop: 2 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  idCard: { backgroundColor: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 10, color: '#64748b', fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  idName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  idEmail: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  idRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  idLabel: { fontSize: 12, color: '#64748b' },
  idValue: { fontSize: 12, color: '#e2e8f0', fontWeight: '600' },
  idHash: { fontSize: 11, color: '#94a3b8', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  verifiedBadge: { backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginTop: 10 },
  verifiedText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  refreshBtn: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 14, color: '#6b7280' },
  infoValue: { fontSize: 14, color: '#1f2937', fontWeight: '600' },
  logoutBtn: { backgroundColor: '#fee2e2', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 10 },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 10 },
});

export default ProfileScreen;
