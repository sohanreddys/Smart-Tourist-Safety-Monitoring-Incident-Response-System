import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import api from '../services/api';

const SERVICE_TYPES = [
  { key: 'all', label: 'All', icon: '🏥' },
  { key: 'hospital', label: 'Hospitals', icon: '🏥' },
  { key: 'police', label: 'Police', icon: '👮' },
  { key: 'fire', label: 'Fire Station', icon: '🚒' },
  { key: 'pharmacy', label: 'Pharmacy', icon: '💊' },
];

const NATIONAL_HELPLINES = [
  { name: 'Emergency', phone: '112', icon: '🆘' },
  { name: 'Police', phone: '100', icon: '👮' },
  { name: 'Ambulance', phone: '108', icon: '🚑' },
  { name: 'Fire', phone: '101', icon: '🚒' },
  { name: 'Women Help', phone: '1091', icon: '👩' },
  { name: 'Tourist Help', phone: '1363', icon: '🧳' },
  { name: 'Disaster', phone: '1078', icon: '⚠️' },
  { name: 'Road Help', phone: '1073', icon: '🛣️' },
];

const EmergencyServicesScreen = () => {
  const [location, setLocation] = useState(null);
  const [services, setServices] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [helplines, setHelplines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLocation();
  }, []);

  const loadLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        await loadServices(loc.coords.latitude, loc.coords.longitude);
      } else {
        // Default to Hyderabad if no location access
        setLocation({ lat: 17.385, lng: 78.4867 });
        await loadServices(17.385, 78.4867);
      }
    } catch (e) {
      setLocation({ lat: 17.385, lng: 78.4867 });
      await loadServices(17.385, 78.4867);
    }
  };

  const loadServices = async (lat, lng) => {
    setLoading(true);
    try {
      const res = await api.get('/location/nearby-services?lat=' + lat + '&lng=' + lng);
      const svcs = res.data.services || [];
      setAllServices(svcs);
      setServices(svcs);
      setHelplines(res.data.nationalHelplines || NATIONAL_HELPLINES);
    } catch (e) {
      // Use national helplines even if API fails
      setHelplines(NATIONAL_HELPLINES);
    }
    setLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLocation();
    setRefreshing(false);
  }, []);

  // Filter services by type
  useEffect(() => {
    if (selectedType === 'all') {
      setServices(allServices);
    } else {
      setServices(allServices.filter(s => s.type === selectedType));
    }
    setShowAll(false);
  }, [selectedType, allServices]);

  const displayedServices = showAll ? services : services.slice(0, 5);

  const openDirections = (lat, lng, name) => {
    const encodedName = encodeURIComponent(name || 'Destination');
    if (Platform.OS === 'ios') {
      // Try Apple Maps first, fallback to Google Maps
      const appleUrl = 'maps://app?daddr=' + lat + ',' + lng + '&dirflg=d';
      const googleUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
      Linking.canOpenURL(appleUrl).then(supported => {
        if (supported) {
          Linking.openURL(appleUrl);
        } else {
          Linking.openURL(googleUrl);
        }
      });
    } else {
      // Android — try Google Maps app, fallback to browser
      const googleMapsUrl = 'google.navigation:q=' + lat + ',' + lng;
      const webUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
      Linking.canOpenURL(googleMapsUrl).then(supported => {
        if (supported) {
          Linking.openURL(googleMapsUrl);
        } else {
          Linking.openURL(webUrl);
        }
      });
    }
  };

  const searchNearbyOnMaps = (type) => {
    if (!location) return;
    const query = encodeURIComponent(type + ' near me');
    if (Platform.OS === 'ios') {
      Linking.openURL('maps://search?q=' + query);
    } else {
      const url = 'https://www.google.com/maps/search/' + query + '/@' + location.lat + ',' + location.lng + ',14z';
      Linking.openURL(url);
    }
  };

  const renderService = ({ item }) => (
    <View style={styles.serviceCard}>
      <View style={styles.serviceHeader}>
        <View style={styles.serviceTypeChip}>
          <Text style={styles.serviceTypeText}>
            {item.type === 'hospital' ? '🏥' : item.type === 'police' ? '👮' : item.type === 'fire' ? '🚒' : item.type === 'pharmacy' ? '💊' : 'ℹ️'}
            {' '}{item.type?.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.distanceText}>{item.distance}</Text>
      </View>
      <Text style={styles.serviceName}>{item.name}</Text>
      {item.address && <Text style={styles.serviceAddress}>{item.address}</Text>}
      {item.city && <Text style={styles.serviceCity}>{item.city}</Text>}

      <View style={styles.serviceActions}>
        <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL('tel:' + item.phone)}>
          <Text style={styles.callBtnText}>☎ {item.phone}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.directionsBtn} onPress={() => openDirections(item.lat, item.lng, item.name)}>
          <Text style={styles.directionsBtnText}>🗺 Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={displayedServices}
        keyExtractor={(item) => item.id || item.name + item.phone}
        renderItem={renderService}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
        ListHeaderComponent={
          <View>
            {/* Helplines */}
            <Text style={styles.sectionTitle}>India Emergency Helplines</Text>
            <View style={styles.helplinesGrid}>
              {helplines.slice(0, 8).map((h, i) => (
                <TouchableOpacity key={i} style={styles.helplineCard} onPress={() => Linking.openURL('tel:' + h.phone)}>
                  <Text style={styles.helplineNumber}>{h.phone}</Text>
                  <Text style={styles.helplineName}>{h.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search on Maps buttons */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Search on Maps</Text>
            <View style={styles.searchBtnsRow}>
              <TouchableOpacity style={styles.mapSearchBtn} onPress={() => searchNearbyOnMaps('hospital')}>
                <Text style={styles.mapSearchText}>🏥 Hospitals</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapSearchBtn} onPress={() => searchNearbyOnMaps('police station')}>
                <Text style={styles.mapSearchText}>👮 Police</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapSearchBtn} onPress={() => searchNearbyOnMaps('fire station')}>
                <Text style={styles.mapSearchText}>🚒 Fire</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapSearchBtn} onPress={() => searchNearbyOnMaps('pharmacy')}>
                <Text style={styles.mapSearchText}>💊 Pharmacy</Text>
              </TouchableOpacity>
            </View>

            {/* Type filter */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Nearby Services</Text>
            <View style={styles.filterRow}>
              {SERVICE_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.filterChip, selectedType === t.key && styles.filterChipActive]}
                  onPress={() => setSelectedType(t.key)}
                >
                  <Text style={[styles.filterChipText, selectedType === t.key && styles.filterChipTextActive]}>
                    {t.icon} {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading && <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 20 }} />}
          </View>
        }
        ListFooterComponent={
          <View style={{ paddingBottom: 30 }}>
            {!showAll && services.length > 5 && (
              <TouchableOpacity style={styles.viewMoreBtn} onPress={() => setShowAll(true)}>
                <Text style={styles.viewMoreText}>View More ({services.length - 5} more)</Text>
              </TouchableOpacity>
            )}
            {showAll && services.length > 5 && (
              <TouchableOpacity style={styles.viewMoreBtn} onPress={() => setShowAll(false)}>
                <Text style={styles.viewMoreText}>Show Less</Text>
              </TouchableOpacity>
            )}
            {!loading && displayedServices.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No services found for this filter.</Text>
                <TouchableOpacity style={styles.mapSearchBtn} onPress={() => searchNearbyOnMaps(selectedType === 'all' ? 'hospital' : selectedType)}>
                  <Text style={styles.mapSearchText}>Search on Maps</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  helplinesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  helplineCard: {
    backgroundColor: '#fee2e2', borderRadius: 12, padding: 12, alignItems: 'center',
    width: '23%', minWidth: 75,
  },
  helplineNumber: { fontSize: 18, fontWeight: '800', color: '#dc2626' },
  helplineName: { fontSize: 9, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  searchBtnsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mapSearchBtn: {
    backgroundColor: '#dbeafe', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    flexGrow: 1, alignItems: 'center',
  },
  mapSearchText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  filterChip: {
    backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  filterChipTextActive: { color: '#fff' },
  serviceCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  serviceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  serviceTypeChip: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  serviceTypeText: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
  distanceText: { fontSize: 12, fontWeight: '600', color: '#2563eb' },
  serviceName: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
  serviceAddress: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  serviceCity: { fontSize: 11, color: '#9ca3af' },
  serviceActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  callBtn: {
    flex: 1, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  directionsBtn: {
    flex: 1, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  directionsBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  viewMoreBtn: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center',
    marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb',
  },
  viewMoreText: { color: '#2563eb', fontWeight: '700', fontSize: 15 },
  emptyBox: { alignItems: 'center', padding: 20 },
  emptyText: { color: '#9ca3af', fontSize: 14, marginBottom: 12 },
});

export default EmergencyServicesScreen;
