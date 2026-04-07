import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration, Alert, Animated, Dimensions, Platform, Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as SMS from 'expo-sms';

// Bundled siren WAV — plays at max volume, overrides silent switch
const SIREN_ASSET = require('../../assets/siren.wav');
import { useAuth } from '../context/AuthContext';
import { connectSocket, getSocket } from '../services/socket';
import api from '../services/api';

const { width, height } = Dimensions.get('window');

const SOSScreen = () => {
  const { user } = useAuth();
  const cameraRef = useRef(null);
  const audioRecRef = useRef(null);
  const clipIndexRef = useRef(0);
  const recordingLoopRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sirenSoundRef = useRef(null);

  const [sosMode, setSosMode] = useState('loud'); // 'loud' or 'silent'
  const [sirenPlaying, setSirenPlaying] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [audioPermStatus, setAudioPermStatus] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [currentAlertId, setCurrentAlertId] = useState(null);
  const [countdown, setCountdown] = useState(7);
  const [canCancel, setCanCancel] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [location, setLocation] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clipCount, setClipCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);

  // Get location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          altitude: loc.coords.altitude,
          speed: loc.coords.speed,
          heading: loc.coords.heading,
        });
      }
    })();
  }, []);

  // Request audio permission
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setAudioPermStatus(status);
    })();
  }, []);

  // Countdown timer once SOS is active
  useEffect(() => {
    if (!sosActive) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setCanCancel(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sosActive]);

  // Elapsed timer
  useEffect(() => {
    if (!sosActive) return;
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [sosActive]);

  // Pulse animation for SOS button
  useEffect(() => {
    if (sosActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sosActive]);

  // Listen for alert resolution from admin
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(user);
    socket.on('alert:resolved', (data) => {
      if (data.alertId === currentAlertId) {
        stopAllRecording();
        Alert.alert('Alert Resolved', data.message || 'Your alert has been resolved by authorities.');
        resetSOS();
      }
    });
  }, [user, currentAlertId]);

  const collectDeviceInfo = async () => {
    try {
      const bat = await Battery.getBatteryLevelAsync();
      const batState = await Battery.getBatteryStateAsync();
      const net = await Network.getNetworkStateAsync();
      return {
        model: (Device.brand || '') + ' ' + (Device.modelName || ''),
        os: (Device.osName || '') + ' ' + (Device.osVersion || ''),
        battery: bat ? Math.round(bat * 100) : null,
        isCharging: batState === Battery.BatteryState.CHARGING,
        networkType: net.type || 'unknown',
        ipAddress: net.isConnected ? 'connected' : 'disconnected',
      };
    } catch (e) {
      return { model: 'unknown', os: 'unknown' };
    }
  };

  const startSiren = async () => {
    try {
      // Override iOS silent switch, use media volume channel (max), background capable
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,       // bypass the mute/silent switch on iOS
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false, // use loud speaker on Android
      });
      const { sound } = await Audio.Sound.createAsync(
        SIREN_ASSET,
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      sirenSoundRef.current = sound;
      setSirenPlaying(true);
      // Vibration loop alongside the siren
      Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800], true);
    } catch (e) {
      console.error('Siren error:', e);
    }
  };

  const stopSiren = async () => {
    try {
      if (sirenSoundRef.current) {
        await sirenSoundRef.current.stopAsync();
        await sirenSoundRef.current.unloadAsync();
        sirenSoundRef.current = null;
      }
      Vibration.cancel();
    } catch (e) {}
    setSirenPlaying(false);
  };

  const notifyEmergencyContacts = async (loc) => {
    try {
      // Support both single contact (User.emergencyContactPhone) and array (emergencyContacts)
      const contacts = [];
      if (user?.emergencyContactPhone) contacts.push(user.emergencyContactPhone);
      if (Array.isArray(user?.emergencyContacts)) {
        user.emergencyContacts.forEach(c => {
          if (c?.phone) contacts.push(c.phone);
        });
      }
      if (contacts.length === 0) return;
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) return;
      const mapsUrl = loc
        ? 'https://maps.google.com/?q=' + loc.lat + ',' + loc.lng
        : '(location unavailable)';
      const body =
        '🚨 EMERGENCY — ' + (user?.name || 'A WanderMate user') +
        ' has triggered an SOS and may need help.\n\nLive location: ' + mapsUrl +
        '\n\nSent automatically by WanderMate.';
      await SMS.sendSMSAsync(contacts, body);
    } catch (e) {
      console.error('SMS error:', e);
    }
  };

  const handleSOS = async () => {
    // Request camera permission if not granted
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera Required', 'Camera permission is needed for evidence recording during emergencies.');
      }
    }

    setSosActive(true);
    setCountdown(7);
    setCanCancel(false);
    setElapsedTime(0);
    setClipCount(0);
    clipIndexRef.current = 0;

    Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500]);

    // Loud mode: blast siren immediately to alert nearby people
    if (sosMode === 'loud') {
      startSiren();
    }

    // Gather device info
    const deviceInfo = await collectDeviceInfo();

    // Refresh location
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({
        lat: loc.coords.latitude, lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy, altitude: loc.coords.altitude,
        speed: loc.coords.speed, heading: loc.coords.heading,
      });
    } catch (e) {}

    // Notify emergency contacts via SMS with live location
    const currentLoc = location || null;
    notifyEmergencyContacts(currentLoc);

    // Send SOS to backend
    const alertData = {
      type: 'sos',
      mode: sosMode,
      message: 'EMERGENCY SOS (' + sosMode.toUpperCase() + ') — Recording active!',
      lat: location?.lat, lng: location?.lng,
      accuracy: location?.accuracy, altitude: location?.altitude,
      speed: location?.speed, heading: location?.heading,
      deviceInfo,
    };

    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        const res = await api.post('/alerts/sos', alertData);
        const alertId = res.data.alert?.id || res.data.alert?._id;
        setCurrentAlertId(alertId);

        const socket = getSocket();
        if (socket) {
          socket.emit('sos:trigger', { ...alertData, userId: user.id, userName: user.name });
        }

        // Start recording after alert is created
        if (alertId && cameraPermission?.granted) {
          setShowCamera(true);
          setTimeout(() => startRecordingLoop(alertId), 1000);
        }
      }
    } catch (err) {
      console.error('SOS error:', err);
    }
  };

  const startRecordingLoop = async (alertId) => {
    recordingLoopRef.current = true;
    while (recordingLoopRef.current) {
      try {
        if (!cameraRef.current) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        setRecording(true);
        // 10s clips — short enough to look near-live, long enough to be reliable on both platforms
        const video = await cameraRef.current.recordAsync({ maxDuration: 10 });
        setRecording(false);
        if (!recordingLoopRef.current) break;
        if (!video || !video.uri) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        clipIndexRef.current += 1;
        setClipCount(clipIndexRef.current);

        // Serialize uploads so we don't flood the network on Android
        await uploadClip(alertId, video.uri, cameraFacing, clipIndexRef.current);

        // NOTE: camera is no longer auto-switched. User uses the manual
        // FRONT/REAR toggle button on the overlay to change cameras.
      } catch (e) {
        console.error('Recording error:', e);
        setRecording(false);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  };

  const uploadClip = async (alertId, uri, camFacing, index) => {
    const attemptUpload = async () => {
      const formData = new FormData();
      // iOS sometimes emits file:// URIs with extra characters — normalize
      const cleanUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
      formData.append('file', {
        uri: cleanUri,
        name: 'clip_' + index + '.mp4',
        type: 'video/mp4',
      });
      formData.append('type', 'video');
      formData.append('cameraType', camFacing);
      formData.append('clipIndex', String(index));
      formData.append('duration', '10');
      return api.post('/evidence/' + alertId + '/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data', Accept: 'application/json' },
        timeout: 180000,
        transformRequest: (data) => data, // don't let axios touch FormData
      });
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await attemptUpload();
        console.log('Clip ' + index + ' uploaded (attempt ' + attempt + ')');
        return;
      } catch (e) {
        console.error('Upload clip ' + index + ' attempt ' + attempt + ' failed:', e.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  };

  const stopAllRecording = async () => {
    await stopSiren();
    recordingLoopRef.current = false;
    try {
      if (cameraRef.current && recording) {
        cameraRef.current.stopRecording();
      }
    } catch (e) {}
    setRecording(false);
    setShowCamera(false);
  };

  const resetSOS = () => {
    setSosActive(false);
    setCurrentAlertId(null);
    setCountdown(7);
    setCanCancel(false);
    setElapsedTime(0);
    setShowCamera(false);
    setRecording(false);
  };

  const handleCancel = async () => {
    if (!canCancel) return;

    Alert.alert(
      'Cancel Emergency',
      'Are you sure you are safe? This will stop the emergency recording and alert.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel Alert',
          style: 'destructive',
          onPress: async () => {
            await stopAllRecording();
            try {
              if (currentAlertId) {
                await api.post('/alerts/' + currentAlertId + '/cancel');
                await api.post('/evidence/' + currentAlertId + '/stop-recording');
              }
            } catch (e) {}
            resetSOS();
          },
        },
      ]
    );
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };

  // --- ACTIVE SOS SCREEN ---
  if (sosActive) {
    return (
      <View style={styles.sosActiveContainer}>
        {/* Camera preview */}
        {showCamera && cameraPermission?.granted && (
          <CameraView
            ref={cameraRef}
            style={styles.cameraPreview}
            facing={cameraFacing}
            mode="video"
          />
        )}

        {/* Overlay on top of camera */}
        <View style={styles.sosOverlay}>
          {/* Recording indicator */}
          <View style={styles.recordingHeader}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              {recording ? 'RECORDING — ' + cameraFacing.toUpperCase() + ' CAM' : 'PREPARING...'}
            </Text>
          </View>

          <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
          <Text style={styles.statusText}>Emergency alert active</Text>
          <Text style={styles.statusSubtext}>Authorities have been notified</Text>

          {/* Info cards */}
          <View style={styles.infoRow}>
            <View style={styles.infoCard}>
              <Text style={styles.infoValue}>{clipCount}</Text>
              <Text style={styles.infoLabel}>Clips Recorded</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoValue}>{cameraFacing === 'back' ? 'REAR' : 'FRONT'}</Text>
              <Text style={styles.infoLabel}>Active Camera</Text>
            </View>
          </View>

          {location && (
            <Text style={styles.locText}>
              Lat: {location.lat?.toFixed(5)}, Lng: {location.lng?.toFixed(5)}
            </Text>
          )}

          {/* Action row: Siren + Camera switch */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => (sirenPlaying ? stopSiren() : startSiren())}
            >
              <Text style={styles.actionBtnText}>
                {sirenPlaying ? '🔇 MUTE' : '📢 SIREN'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setCameraFacing(prev => prev === 'back' ? 'front' : 'back')}
            >
              <Text style={styles.actionBtnText}>
                🔄 {cameraFacing === 'back' ? 'FRONT CAM' : 'REAR CAM'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cancel button — only after 7 seconds */}
          {canCancel ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>CANCEL ALERT — I AM SAFE</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownLabel}>Cancel available in</Text>
              <Text style={styles.countdownNumber}>{countdown}s</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // --- DEFAULT: BIG SOS BUTTON ---
  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.headerTitle}>Emergency SOS</Text>
        <Text style={styles.headerSubtitle}>
          Press the button below in case of emergency.{'\n'}
          Recording will start automatically from all cameras.
        </Text>
      </View>

      <View style={styles.modeToggleRow}>
        <TouchableOpacity
          style={[styles.modeBtn, sosMode === 'loud' && styles.modeBtnActiveLoud]}
          onPress={() => setSosMode('loud')}
        >
          <Text style={styles.modeIcon}>📢</Text>
          <Text style={[styles.modeBtnText, sosMode === 'loud' && styles.modeBtnTextActive]}>LOUD SIREN</Text>
          <Text style={styles.modeBtnSub}>Alert nearby people</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, sosMode === 'silent' && styles.modeBtnActiveSilent]}
          onPress={() => setSosMode('silent')}
        >
          <Text style={styles.modeIcon}>🤫</Text>
          <Text style={[styles.modeBtnText, sosMode === 'silent' && styles.modeBtnTextActive]}>SILENT SOS</Text>
          <Text style={styles.modeBtnSub}>Discreet alert</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonSection}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.sosButton}
            onPress={handleSOS}
            activeOpacity={0.7}
          >
            <Text style={styles.sosIcon}>🚨</Text>
            <Text style={styles.sosButtonText}>SOS</Text>
            <Text style={styles.sosButtonSub}>PRESS FOR EMERGENCY</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <View style={styles.bottomInfo}>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>📹</Text>
          <Text style={styles.featureText}>Auto-records video from front & back cameras</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>☁️</Text>
          <Text style={styles.featureText}>Evidence uploaded to cloud in real-time</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>📍</Text>
          <Text style={styles.featureText}>Live GPS location shared with authorities</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>📲</Text>
          <Text style={styles.featureText}>SMS with live location sent to your emergency contacts</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🔒</Text>
          <Text style={styles.featureText}>Cannot cancel for 7 seconds (safety measure)</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  topSection: { paddingTop: 60, paddingHorizontal: 24, alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  buttonSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sosButton: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#dc2626',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 30, elevation: 20,
    borderWidth: 6, borderColor: 'rgba(239,68,68,0.3)',
  },
  sosIcon: { fontSize: 40, marginBottom: 4 },
  sosButtonText: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 4 },
  sosButtonSub: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginTop: 4, letterSpacing: 1 },
  bottomInfo: { paddingHorizontal: 24, paddingBottom: 40 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  featureIcon: { fontSize: 18, marginRight: 12 },
  featureText: { fontSize: 13, color: '#94a3b8', flex: 1 },

  // Active SOS styles
  sosActiveContainer: { flex: 1, backgroundColor: '#000' },
  cameraPreview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sosOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  recordingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  recordingDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#ef4444', marginRight: 8 },
  recordingText: { color: '#ef4444', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  timerText: { fontSize: 64, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'] },
  statusText: { fontSize: 18, fontWeight: '700', color: '#fbbf24', marginTop: 8 },
  statusSubtext: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  infoRow: { flexDirection: 'row', marginTop: 24, gap: 12 },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 16,
    alignItems: 'center', minWidth: 120,
  },
  infoValue: { fontSize: 24, fontWeight: '800', color: '#fff' },
  infoLabel: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  locText: { fontSize: 11, color: '#64748b', marginTop: 16, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  cancelBtn: {
    marginTop: 30, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 18,
    paddingHorizontal: 32, width: '100%', alignItems: 'center',
  },
  cancelBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  countdownBox: { marginTop: 30, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, width: '100%' },
  countdownLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  countdownNumber: { color: '#fbbf24', fontSize: 48, fontWeight: '900', marginTop: 4 },

  modeToggleRow: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 20, gap: 12 },
  modeBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  modeBtnActiveLoud: { borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.15)' },
  modeBtnActiveSilent: { borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)' },
  modeIcon: { fontSize: 22, marginBottom: 4 },
  modeBtnText: { color: '#94a3b8', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  modeBtnTextActive: { color: '#fff' },
  modeBtnSub: { color: '#64748b', fontSize: 10, marginTop: 2 },
  sirenToggle: {
    marginTop: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  sirenToggleText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  actionBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
});

export default SOSScreen;
