import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, TextInput,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { collectDeviceInfo } from '../services/deviceInfo';
import api from '../services/api';

const ProfileScreen = () => {
  const { user, deviceInfo, logout, updateProfile } = useAuth();
  const [digitalId, setDigitalId] = useState(null);
  const [freshDeviceInfo, setFreshDeviceInfo] = useState(deviceInfo);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => { loadDigitalId(); }, []);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        phone: user.phone || '',
        nationality: user.nationality || '',
        passportNumber: user.passportNumber || '',
        dateOfBirth: user.dateOfBirth || '',
        gender: user.gender || '',
        emergencyContactName: user.emergencyContactName || '',
        emergencyContactPhone: user.emergencyContactPhone || '',
        emergencyContactRelation: user.emergencyContactRelation || '',
        address: user.address || '',
        bloodGroup: user.bloodGroup || '',
        medicalConditions: user.medicalConditions || '',
        preferredLanguage: user.preferredLanguage || 'English',
        travelPurpose: user.travelPurpose || '',
      });
    }
  }, [user]);

  const loadDigitalId = async () => {
    try { const res = await api.post('/blockchain/digital-id'); setDigitalId(res.data.digitalId); } catch (e) {}
  };

  const refreshDeviceInfo = async () => {
    const info = await collectDeviceInfo();
    setFreshDeviceInfo(info);
    Alert.alert('Refreshed', 'Device information updated.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(form);
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (err) {
      Alert.alert('Error', 'Failed to update profile');
    }
    setSaving(false);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const updateField = (key, value) => setForm({ ...form, [key]: value });
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
        <TouchableOpacity style={styles.editToggle} onPress={() => setEditing(!editing)}>
          <Text style={styles.editToggleText}>{editing ? 'Cancel Edit' : 'Edit Profile'}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <View style={styles.editCard}>
          <Text style={styles.sectionTitle}>Edit Profile</Text>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput style={styles.editInput} value={form.name} onChangeText={v => updateField('name', v)} placeholder="Full Name" />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput style={styles.editInput} value={form.phone} onChangeText={v => updateField('phone', v)} placeholder="Phone" keyboardType="phone-pad" />

          <Text style={styles.fieldLabel}>Nationality</Text>
          <TextInput style={styles.editInput} value={form.nationality} onChangeText={v => updateField('nationality', v)} placeholder="Nationality" />

          <Text style={styles.fieldLabel}>Passport / ID Number</Text>
          <TextInput style={styles.editInput} value={form.passportNumber} onChangeText={v => updateField('passportNumber', v)} placeholder="Passport No." />

          <Text style={styles.fieldLabel}>Date of Birth</Text>
          <TextInput style={styles.editInput} value={form.dateOfBirth} onChangeText={v => updateField('dateOfBirth', v)} placeholder="YYYY-MM-DD" />

          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.chipRow}>
            {['male', 'female', 'other'].map(g => (
              <TouchableOpacity key={g} style={[styles.chip, form.gender === g && styles.chipActive]} onPress={() => updateField('gender', g)}>
                <Text style={[styles.chipText, form.gender === g && styles.chipTextActive]}>{g.charAt(0).toUpperCase() + g.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Blood Group</Text>
          <View style={styles.chipRow}>
            {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
              <TouchableOpacity key={bg} style={[styles.chipSmall, form.bloodGroup === bg && styles.chipActive]} onPress={() => updateField('bloodGroup', bg)}>
                <Text style={[styles.chipText, form.bloodGroup === bg && styles.chipTextActive]}>{bg}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Home Address</Text>
          <TextInput style={styles.editInput} value={form.address} onChangeText={v => updateField('address', v)} placeholder="Address" />

          <Text style={styles.fieldLabel}>Travel Purpose</Text>
          <TextInput style={styles.editInput} value={form.travelPurpose} onChangeText={v => updateField('travelPurpose', v)} placeholder="Tourism, Business, etc." />

          <Text style={styles.fieldLabel}>Medical Conditions</Text>
          <TextInput style={[styles.editInput, { height: 60 }]} value={form.medicalConditions} onChangeText={v => updateField('medicalConditions', v)} placeholder="Allergies, conditions..." multiline />

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Emergency Contact</Text>
          <TextInput style={styles.editInput} value={form.emergencyContactName} onChangeText={v => updateField('emergencyContactName', v)} placeholder="Contact Name" />
          <TextInput style={styles.editInput} value={form.emergencyContactPhone} onChangeText={v => updateField('emergencyContactPhone', v)} placeholder="Contact Phone" keyboardType="phone-pad" />

          <View style={styles.chipRow}>
            {['parent', 'spouse', 'sibling', 'friend', 'other'].map(r => (
              <TouchableOpacity key={r} style={[styles.chip, form.emergencyContactRelation === r && styles.chipActive]} onPress={() => updateField('emergencyContactRelation', r)}>
                <Text style={[styles.chipText, form.emergencyContactRelation === r && styles.chipTextActive]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Profile Info Cards */}
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Personal Info</Text>
            <InfoRow label="Phone" value={user?.phone || 'Not set'} />
            <InfoRow label="Nationality" value={user?.nationality || 'Not set'} />
            <InfoRow label="Passport" value={user?.passportNumber || 'Not set'} />
            <InfoRow label="DOB" value={user?.dateOfBirth || 'Not set'} />
            <InfoRow label="Gender" value={user?.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'Not set'} />
            <InfoRow label="Blood Group" value={user?.bloodGroup || 'Not set'} />
            <InfoRow label="Language" value={user?.preferredLanguage || 'English'} />
            <InfoRow label="Travel Purpose" value={user?.travelPurpose || 'Not set'} />
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Emergency Contact</Text>
            <InfoRow label="Name" value={user?.emergencyContactName || 'Not set'} />
            <InfoRow label="Phone" value={user?.emergencyContactPhone || 'Not set'} />
            <InfoRow label="Relation" value={user?.emergencyContactRelation || 'Not set'} />
          </View>

          {user?.medicalConditions ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Medical Info</Text>
              <Text style={styles.medicalText}>{user.medicalConditions}</Text>
            </View>
          ) : null}
        </>
      )}

      {digitalId && !editing && (
        <View style={styles.idCard}>
          <Text style={styles.sectionLabel}>BLOCKCHAIN DIGITAL ID</Text>
          <Text style={styles.idName}>{digitalId.userName}</Text>
          <Text style={styles.idEmail}>{digitalId.userEmail}</Text>
          {digitalId.touristIdNumber && (
            <Text style={styles.idNumber}>{digitalId.touristIdNumber}</Text>
          )}
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Block #</Text>
            <Text style={styles.idValue}>{digitalId.index}</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Hash</Text>
            <Text style={styles.idHash}>{digitalId.hash?.substring(0, 24)}...</Text>
          </View>
          {digitalId.verificationCode && (
            <View style={styles.idRow}>
              <Text style={styles.idLabel}>Verification</Text>
              <Text style={[styles.idValue, { color: '#22c55e', fontWeight: '800' }]}>{digitalId.verificationCode}</Text>
            </View>
          )}
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Issued</Text>
            <Text style={styles.idValue}>{new Date(digitalId.issuedAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        </View>
      )}

      {!editing && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Device Details</Text>
            <TouchableOpacity onPress={refreshDeviceInfo}>
              <Text style={styles.refreshBtn}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {info?.device && (
            <View style={styles.infoCard}>
              <InfoRow label="Device" value={(info.device.brand || '') + ' ' + (info.device.modelName || '')} />
              <InfoRow label="OS" value={(info.device.osName || '') + ' ' + (info.device.osVersion || '')} />
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
        </View>
      )}

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
  editToggle: { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  editToggleText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  editCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 4, marginTop: 8 },
  editInput: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 12, fontSize: 15, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  medicalText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  idCard: { backgroundColor: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 10, color: '#64748b', fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  idName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  idEmail: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  idNumber: { fontSize: 16, fontWeight: '800', color: '#fbbf24', marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
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
  infoValue: { fontSize: 14, color: '#1f2937', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  logoutBtn: { backgroundColor: '#fee2e2', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 10 },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 10 },
});

export default ProfileScreen;
