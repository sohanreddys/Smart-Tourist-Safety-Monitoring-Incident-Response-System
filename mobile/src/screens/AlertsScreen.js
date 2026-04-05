import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import api from '../services/api';

const AlertsScreen = () => {
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = async () => {
    try {
      const res = await api.get('/alerts');
      setAlerts(res.data.alerts || []);
    } catch (e) {}
  };

  useEffect(() => { loadAlerts(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  }, []);

  const renderAlert = ({ item }) => (
    <View style={[styles.alertCard, item.status === 'active' ? styles.activeCard : styles.resolvedCard]}>
      <View style={styles.alertHeader}>
        <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeResolved]}>
          <Text style={styles.badgeText}>{item.status === 'active' ? 'ACTIVE' : 'RESOLVED'}</Text>
        </View>
        <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.message}>{item.message}</Text>
      {item.lat && (
        <Text style={styles.coords}>Location: {item.lat.toFixed(4)}, {item.lng.toFixed(4)}</Text>
      )}
      {item.resolvedBy && (
        <Text style={styles.resolvedText}>Resolved by {item.resolvedBy}</Text>
      )}
      {item.offlineSync && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>Synced from offline</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlert}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No alerts yet. Stay safe!</Text>
          </View>
        }
        contentContainerStyle={alerts.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  alertCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  activeCard: { borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  resolvedCard: { borderLeftWidth: 4, borderLeftColor: '#22c55e' },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeActive: { backgroundColor: '#fee2e2' },
  badgeResolved: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11, color: '#9ca3af' },
  message: { fontSize: 15, color: '#374151', marginBottom: 6 },
  coords: { fontSize: 12, color: '#6b7280' },
  resolvedText: { fontSize: 12, color: '#16a34a', marginTop: 4 },
  offlineBadge: { backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 6 },
  offlineBadgeText: { fontSize: 11, color: '#1d4ed8', fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#9ca3af' },
  emptyContainer: { flex: 1 },
});

export default AlertsScreen;
