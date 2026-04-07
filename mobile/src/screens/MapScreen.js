import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, Dimensions, Linking, Modal,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useAuth } from '../context/AuthContext';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import { saveOfflineAlert, getOfflineQueue, syncOfflineAlerts } from '../utils/offline';
import api from '../services/api';

const { width } = Dimensions.get('window');

const MapScreen = () => {
  const { user } = useAuth();
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [geofences, setGeofences] = useState([]);
  const [services, setServices] = useState([]);
  const [geofenceWarning, setGeofenceWarning] = useState(null);
  const [showServices, setShowServices] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [offlineCount, setOfflineCount] = useState(0);

  useEffect(() => {
    if (user) { connectSocket(user); }
    return () => disconnectSocket();
  }, [user]);

  useEffect(() => {
    let subscription;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for WanderMate to work.');
        return;
      }
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 10000 },
        (loc) => {
          const pos = {
            lat: loc.coords.latitude, lng: loc.coords.longitude,
            accuracy: loc.coords.accuracy, speed: loc.coords.speed, heading: loc.coords.heading,
          };
          setLocation(pos);
          sendLocationToServer(pos);
          checkGeofences(pos);
        }
      );
    })();
    return () => { if (subscription) subscription.remove(); };
  }, []);

  useEffect(() => {
    loadGeofences();
    checkOfflineQueue();
  }, []);

  const checkOfflineQueue = async () => {
    const queue = await getOfflineQueue();
    setOfflineCount(queue.length);
    if (queue.length > 0) {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        const result = await syncOfflineAlerts(api);
        if (result.synced > 0) {
          setOfflineCount(0);
          Alert.alert('Synced', result.synced + ' offline alert(s) synced successfully.');
        }
      }
    }
  };

  const sendLocationToServer = async (loc) => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return;
      await api.post('/location/update', loc);
      const socket = getSocket();
      if (socket) { socket.emit('location:update', { userId: user.id, userName: user.name, ...loc }); }
    } catch (e) {}
  };

  const checkGeofences = async (loc) => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return;
      const res = await api.post('/geofence/check', { lat: loc.lat, lng: loc.lng });
      if (res.data.insideGeofence) {
        const v = res.data.violations[0];
        if (!geofenceWarning || geofenceWarning.name !== v.name) {
          setGeofenceWarning(v);
          Vibration.vibrate([0, 500, 200, 500]);
          Alert.alert('Danger Zone', 'You entered: ' + v.name + '\nRisk Level: ' + v.riskLevel.toUpperCase());
          const socket = getSocket();
          if (socket) {
            socket.emit('geofence:violation', {
              userId: user.id, userName: user.name,
              geofence: v.name, riskLevel: v.riskLevel,
              lat: loc.lat, lng: loc.lng,
            });
          }
        }
      } else { setGeofenceWarning(null); }
    } catch (e) {}
  };

  const loadGeofences = async () => {
    try { const res = await api.get('/geofence'); setGeofences(res.data.geofences || []); } catch (e) {}
  };

  const loadNearbyServices = async () => {
    try {
      const lat = location?.lat || 17.385;
      const lng = location?.lng || 78.4867;
      const res = await api.get('/location/nearby-services?lat=' + lat + '&lng=' + lng);
      setServices(res.data.services || []);
      setShowServices(true);
    } catch (e) {}
  };

  const handleSOS = async () => {
    setSosActive(true);
    Vibration.vibrate([0, 300, 100, 300, 100, 300]);
    const alertData = {
      type: 'sos', message: 'Emergency SOS triggered from mobile!',
      lat: location?.lat, lng: location?.lng,
    };
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected) {
      try {
        await api.post('/alerts/sos', alertData);
        const socket = getSocket();
        if (socket) { socket.emit('sos:trigger', { ...alertData, userId: user.id, userName: user.name }); }
        await api.post('/blockchain/log', {
          action: 'SOS_TRIGGERED_MOBILE',
          details: 'SOS from ' + (location?.lat?.toFixed(4)) + ', ' + (location?.lng?.toFixed(4)),
        });
        Alert.alert('SOS Sent', 'Your emergency alert has been sent to authorities. Help is on the way.');
      } catch (e) {
        Alert.alert('Error', 'Failed to send SOS. Saved offline.');
        await saveOfflineAlert(alertData);
      }
    } else {
      await saveOfflineAlert(alertData);
      const queue = await getOfflineQueue();
      setOfflineCount(queue.length);
      Alert.alert('Offline SOS', 'No internet. Alert saved locally and will sync when connected.');
    }
    setTimeout(() => setSosActive(false), 3000);
  };

  const region = location ? {
    latitude: location.lat, longitude: location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02,
  } : {
    latitude: 17.385, longitude: 78.4867, latitudeDelta: 0.05, longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      {geofenceWarning && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>WARNING: Inside {geofenceWarning.name} (Risk: {geofenceWarning.riskLevel})</Text>
        </View>
      )}
      {offlineCount > 0 && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{offlineCount} offline alert(s) pending sync</Text>
        </View>
      )}
      <MapView ref={mapRef} style={styles.map} provider={PROVIDER_DEFAULT} initialRegion={region}
        showsUserLocation showsMyLocationButton>
        {geofences.map((f) => (
          <Circle key={f.id} center={{ latitude: f.lat, longitude: f.lng }} radius={f.radius}
            strokeColor={f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6'}
            fillColor={f.riskLevel === 'high' ? 'rgba(239,68,68,0.15)' : f.riskLevel === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}
            strokeWidth={2} />
        ))}
        {geofences.map((f) => (
          <Marker key={'label-' + f.id} coordinate={{ latitude: f.lat, longitude: f.lng }}
            title={f.name} description={f.riskLevel + ' risk — ' + f.description}
            pinColor={f.riskLevel === 'high' ? 'red' : f.riskLevel === 'medium' ? 'orange' : 'blue'} />
        ))}
        {showServices && services.map((s) => (
          <Marker key={'svc-' + s.id} coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.name} description={s.type + ' — ' + s.phone}
            pinColor="green" onPress={() => setSelectedService(s)} />
        ))}
      </MapView>
      <View style={styles.controls}>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnServices} onPress={loadNearbyServices}>
            <Text style={styles.btnSmallText}>Nearby Services</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnZones} onPress={loadGeofences}>
            <Text style={styles.btnSmallText}>Risk Zones</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.sosButton, sosActive && styles.sosDisabled]} onPress={handleSOS}
          disabled={sosActive} activeOpacity={0.7}>
          <Text style={styles.sosText}>{sosActive ? 'SOS SENT!' : 'SOS EMERGENCY'}</Text>
        </TouchableOpacity>
        {location && (
          <Text style={styles.coordsText}>
            {location.lat.toFixed(6)}, {location.lng.toFixed(6)} | ±{Math.round(location.accuracy || 0)}m
          </Text>
        )}
      </View>

      {/* Service Details Modal */}
      <Modal visible={!!selectedService} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedService?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedService(null)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.serviceDetails}>
              <DetailRow label="Type" value={selectedService?.type || 'N/A'} />
              <DetailRow label="Distance" value={selectedService?.distance || 'N/A'} />
              {selectedService?.city && <DetailRow label="City" value={selectedService.city} />}
              {selectedService?.address && <DetailRow label="Address" value={selectedService.address} />}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => {
                if (selectedService?.phone) {
                  Linking.openURL('tel:' + selectedService.phone);
                }
              }}>
                <Text style={styles.actionButtonText}>☎ Call {selectedService?.phone}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionButton, styles.actionButtonBlue]} onPress={() => {
                if (selectedService?.lat && selectedService?.lng) {
                  const url = 'https://www.google.com/maps/dir/?api=1&destination=' + selectedService.lat + ',' + selectedService.lng;
                  Linking.openURL(url);
                }
              }}>
                <Text style={styles.actionButtonText}>🗺 Get Directions</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setSelectedService(null)}>
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const DetailRow = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  warningBanner: { backgroundColor: '#dc2626', padding: 10, alignItems: 'center' },
  warningText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 6, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  map: { flex: 1 },
  controls: { padding: 16, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
  buttonRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  btnServices: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnZones: { flex: 1, backgroundColor: '#d97706', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnSmallText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sosButton: { backgroundColor: '#dc2626', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  sosDisabled: { backgroundColor: '#9ca3af' },
  sosText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  coordsText: { textAlign: 'center', color: '#9ca3af', fontSize: 11, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1f2937', flex: 1 },
  closeBtn: { padding: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 20, color: '#6b7280', fontWeight: '700' },
  serviceDetails: { marginBottom: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  detailValue: { fontSize: 13, color: '#1f2937', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  modalActions: { gap: 10, marginBottom: 14 },
  actionButton: { backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center' },
  actionButtonBlue: { backgroundColor: '#2563eb' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeModalBtn: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 14, alignItems: 'center' },
  closeModalBtnText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});

export default MapScreen;
