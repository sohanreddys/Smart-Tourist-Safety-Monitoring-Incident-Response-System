import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const RegisterScreen = ({ navigation }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    nationality: '', passportNumber: '', dateOfBirth: '', gender: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
    bloodGroup: '', address: '', medicalConditions: '', travelPurpose: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const updateField = (key, value) => setForm({ ...form, [key]: value });

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Error', 'Name, email and password are required');
      return;
    }
    if (form.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(form);
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && (!form.name || !form.email || !form.password)) {
      Alert.alert('Error', 'Name, email and password are required');
      return;
    }
    if (step === 1 && form.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setStep(step + 1);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>WanderMate</Text>
          <Text style={styles.subtitle}>Create Your Account — Step {step}/3</Text>
          <View style={styles.progressBar}>
            {[1, 2, 3].map(s => (
              <View key={s} style={[styles.progressDot, s <= step && styles.progressDotActive]} />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          {step === 1 && (
            <>
              <Text style={styles.title}>Basic Information</Text>
              <TextInput style={styles.input} placeholder="Full Name *" value={form.name} onChangeText={v => updateField('name', v)} placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Email *" value={form.email} onChangeText={v => updateField('email', v)} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Password (min 6 chars) *" value={form.password} onChangeText={v => updateField('password', v)} secureTextEntry placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Phone Number" value={form.phone} onChangeText={v => updateField('phone', v)} keyboardType="phone-pad" placeholderTextColor="#9ca3af" />

              <TouchableOpacity style={styles.button} onPress={nextStep}>
                <Text style={styles.buttonText}>Next — Personal Details</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.title}>Personal & Travel Details</Text>
              <TextInput style={styles.input} placeholder="Nationality" value={form.nationality} onChangeText={v => updateField('nationality', v)} placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Passport / ID Number" value={form.passportNumber} onChangeText={v => updateField('passportNumber', v)} placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Date of Birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={v => updateField('dateOfBirth', v)} placeholderTextColor="#9ca3af" />

              <View style={styles.pickerWrapper}>
                <Text style={styles.pickerLabel}>Gender</Text>
                <View style={styles.pickerRow}>
                  {['male', 'female', 'other'].map(g => (
                    <TouchableOpacity key={g} style={[styles.chip, form.gender === g && styles.chipActive]} onPress={() => updateField('gender', g)}>
                      <Text style={[styles.chipText, form.gender === g && styles.chipTextActive]}>{g.charAt(0).toUpperCase() + g.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.pickerWrapper}>
                <Text style={styles.pickerLabel}>Blood Group</Text>
                <View style={styles.pickerRow}>
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                    <TouchableOpacity key={bg} style={[styles.chipSmall, form.bloodGroup === bg && styles.chipActive]} onPress={() => updateField('bloodGroup', bg)}>
                      <Text style={[styles.chipText, form.bloodGroup === bg && styles.chipTextActive]}>{bg}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TextInput style={styles.input} placeholder="Home Address" value={form.address} onChangeText={v => updateField('address', v)} placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Travel Purpose" value={form.travelPurpose} onChangeText={v => updateField('travelPurpose', v)} placeholderTextColor="#9ca3af" />
              <TextInput style={[styles.input, { height: 60 }]} placeholder="Medical Conditions / Allergies" value={form.medicalConditions} onChangeText={v => updateField('medicalConditions', v)} multiline placeholderTextColor="#9ca3af" />

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.buttonBack} onPress={() => setStep(1)}>
                  <Text style={styles.buttonBackText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buttonNext} onPress={nextStep}>
                  <Text style={styles.buttonText}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.title}>Emergency Contact</Text>
              <Text style={styles.helperText}>This person will be contacted in emergencies.</Text>
              <TextInput style={styles.input} placeholder="Contact Name" value={form.emergencyContactName} onChangeText={v => updateField('emergencyContactName', v)} placeholderTextColor="#9ca3af" />
              <TextInput style={styles.input} placeholder="Contact Phone" value={form.emergencyContactPhone} onChangeText={v => updateField('emergencyContactPhone', v)} keyboardType="phone-pad" placeholderTextColor="#9ca3af" />

              <View style={styles.pickerWrapper}>
                <Text style={styles.pickerLabel}>Relationship</Text>
                <View style={styles.pickerRow}>
                  {['parent', 'spouse', 'sibling', 'friend', 'other'].map(r => (
                    <TouchableOpacity key={r} style={[styles.chip, form.emergencyContactRelation === r && styles.chipActive]} onPress={() => updateField('emergencyContactRelation', r)}>
                      <Text style={[styles.chipText, form.emergencyContactRelation === r && styles.chipTextActive]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.buttonBack} onPress={() => setStep(2)}>
                  <Text style={styles.buttonBackText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.buttonCreate, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading}>
                  <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e40af' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  logo: { fontSize: 36, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 14, color: '#93c5fd', marginTop: 4 },
  progressBar: { flexDirection: 'row', marginTop: 12, gap: 8 },
  progressDot: { width: 30, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressDotActive: { backgroundColor: '#fff', width: 45 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1f2937', marginBottom: 16, textAlign: 'center' },
  helperText: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 14 },
  input: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
  pickerWrapper: { marginBottom: 12 },
  pickerLabel: { fontSize: 13, color: '#6b7280', fontWeight: '600', marginBottom: 6 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  buttonBack: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonBackText: { color: '#374151', fontSize: 16, fontWeight: '700' },
  buttonNext: { flex: 1, backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonCreate: { flex: 1, backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#6b7280', fontSize: 14 },
  linkBold: { color: '#2563eb', fontWeight: '600' },
});

export default RegisterScreen;
