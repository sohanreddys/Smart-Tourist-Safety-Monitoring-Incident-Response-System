import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_KEY = 'wandermate_offline_alerts';

export const saveOfflineAlert = async (alert) => {
  try {
    const queue = await getOfflineQueue();
    queue.push({
      ...alert,
      createdAt: new Date().toISOString(),
      offlineId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    });
    await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline alert:', e);
  }
};

export const getOfflineQueue = async () => {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const clearOfflineQueue = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_KEY);
  } catch (e) {
    console.error('Failed to clear offline queue:', e);
  }
};

export const syncOfflineAlerts = async (api) => {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0 };

  try {
    const res = await api.post('/alerts/batch', { alerts: queue });
    await clearOfflineQueue();
    return { synced: res.data.synced };
  } catch (err) {
    return { synced: 0, error: err.message };
  }
};
