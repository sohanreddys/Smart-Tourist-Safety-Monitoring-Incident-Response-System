const OFFLINE_QUEUE_KEY = 'wandermate_offline_alerts';

export const isOnline = () => navigator.onLine;

export const saveOfflineAlert = (alert) => {
  const queue = getOfflineQueue();
  queue.push({
    ...alert,
    createdAt: new Date().toISOString(),
    offlineId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
  });
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline alert:', e);
  }
};

export const getOfflineQueue = () => {
  try {
    const data = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const clearOfflineQueue = () => {
  try {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (e) {
    console.error('Failed to clear offline queue:', e);
  }
};

export const syncOfflineAlerts = async (api) => {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0 };

  try {
    const res = await api.post('/alerts/batch', { alerts: queue });
    clearOfflineQueue();
    return { synced: res.data.synced };
  } catch (err) {
    console.error('Failed to sync offline alerts:', err);
    return { synced: 0, error: err.message };
  }
};
