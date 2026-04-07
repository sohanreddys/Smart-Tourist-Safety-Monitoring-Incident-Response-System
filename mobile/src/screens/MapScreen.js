import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, Dimensions, Linking, Modal, Platform,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useAuth } from '../context/AuthContext';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import { getOfflineQueue, syncOfflineAlerts } from '../utils/offline';
import api from '../services/api';

const { width } = Dimensions.get('window');

const MapScreen = () => {
  const { user } = useAuth();
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [geofences, setGeofences] = useState([]);
  const [services, setServices] = useState([]);
  const [geofenceWarning, setGeofenceWarning] = useState(null);
  const [showServices, setShowServices] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [didInitialCenter, setDidInitialCenter] = useState(false);

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
      // Get an immediate one-shot fix so we can center the map right away
      try {
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const firstPos = {
          lat: first.coords.latitude, lng: first.coords.longitude,
          accuracy: first.coords.accuracy, speed: first.coords.speed, heading: first.coords.heading,
        };
        setLocation(firstPos);
        recenterToUser(firstPos);
        loadNearbyServices(firstPos.lat, firstPos.lng);
      } catch (e) {}

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
          if (!didInitialCenter) {
            recenterToUser(pos);
            setDidInitialCenter(true);
          }
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

  const loadNearbyServices = async (lat, lng) => {
    try {
      const la = lat || location?.lat || 17.385;
      const ln = lng || location?.lng || 78.4867;
      const res = await api.get('/location/nearby-services?lat=' + la + '&lng=' + ln);
      setServices(res.data.services || []);
    } catch (e) {}
  };

  const recenterToUser = (pos) => {
    const p = pos || location;
    if (!p || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: p.lat, longitude: p.lng,
      latitudeDelta: 0.015, longitudeDelta: 0.015,
    }, 600);
  };

  const zoomToItem = (lat, lng) => {
    if (!mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: lat, longitude: lng,
      latitudeDelta: 0.008, longitudeDelta: 0.008,
    }, 600);
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
        {showZones && geofences.map((f) => {
          const isSel = selectedZone && selectedZone.id === f.id;
          return (
            <Circle key={f.id} center={{ latitude: f.lat, longitude: f.lng }} radius={f.radius}
              strokeColor={f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6'}
              fillColor={f.riskLevel === 'high' ? 'rgba(239,68,68,0.15)' : f.riskLevel === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}
              strokeWidth={isSel ? 5 : 2} />
          );
        })}
        {showZones && geofences.map((f) => {
          const isSel = selectedZone && selectedZone.id === f.id;
          return (
            <Marker key={'label-' + f.id} coordinate={{ latitude: f.lat, longitude: f.lng }}
              title={f.name} description={f.riskLevel + ' risk — ' + f.description}
              pinColor={f.riskLevel === 'high' ? 'red' : f.riskLevel === 'medium' ? 'orange' : 'blue'}
              onPress={() => { setSelectedZone(f); zoomToItem(f.lat, f.lng); }}>
              <View style={[styles.marker, styles.markerZone, isSel && styles.markerBig,
                f.riskLevel === 'high' && { backgroundColor: '#dc2626' },
                f.riskLevel === 'medium' && { backgroundColor: '#d97706' }]}>
                <Text style={[styles.markerIcon, isSel && styles.markerIconBig]}>⚠️</Text>
              </View>
            </Marker>
          );
        })}
        {showServices && services.map((s) => {
          const isSel = selectedService && (selectedService.id === s.id);
          const icon = s.type === 'hospital' ? '🏥' : s.type === 'police' ? '👮' : s.type === 'fire' ? '🚒' : s.type === 'pharmacy' ? '💊' : '📍';
          return (
            <Marker key={'svc-' + (s.id || s.name)} coordinate={{ latitude: s.lat, longitude: s.lng }}
              title={s.name} description={(s.type || '') + ' — ' + (s.phone || '')}
              onPress={() => { setSelectedService(s); zoomToItem(s.lat, s.lng); }}>
              <View style={[styles.marker, styles.markerSvc, isSel && styles.markerBig]}>
                <Text style={[styles.markerIcon, isSel && styles.markerIconBig]}>{icon}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Recenter button (floats above controls) */}
      <TouchableOpacity style={styles.recenterBtn} onPress={() => recenterToUser()}>
        <Text style={styles.recenterIcon}>📍</Text>
      </TouchableOpacity>

      <View style={styles.controls}>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, showServices && styles.toggleBtnActive]}
            onPress={() => { setShowServices(!showServices); if (!showServices) loadNearbyServices(); }}>
            <Text style={[styles.toggleBtnText, showServices && styles.toggleBtnTextActive]}>
              🏥 Nearby Services {showServices ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, showZones && styles.toggleBtnActive]}
            onPress={() => { setShowZones(!showZones); if (!showZones) loadGeofences(); }}>
            <Text style={[styles.toggleBtnText, showZones && styles.toggleBtnTextActive]}>
              ⚠️ Risk Zones {showZones ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>
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
  buttonRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  toggleBtnActive: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  toggleBtnText: { color: '#6b7280', fontWeight: '700', fontSize: 12 },
  toggleBtnTextActive: { color: '#1d4ed8' },
  recenterBtn: { position: 'absolute', right: 16, bottom: 160, width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 },
  recenterIcon: { fontSize: 24 },
  marker: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  markerSvc: { backgroundColor: '#16a34a' },
  markerZone: { backgroundColor: '#3b82f6' },
  markerBig: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8 },
  markerIcon: { fontSize: 16 },
  markerIconBig: { fontSize: 26 },
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
