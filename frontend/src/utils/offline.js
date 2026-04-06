const KEY = 'wandermate_offline_alerts';
export const isOnline = () => navigator.onLine;
export const saveOfflineAlert = (alert) => {
  const q = getOfflineQueue();
  q.push({ ...alert, createdAt: new Date().toISOString(), offlineId: Date.now().toString(36) });
  try { window.localStorage.setItem(KEY, JSON.stringify(q)); } catch(e) {}
};
export const getOfflineQueue = () => { try { const d = window.localStorage.getItem(KEY); return d ? JSON.parse(d) : []; } catch { return []; } };
export const clearOfflineQueue = () => { try { window.localStorage.removeItem(KEY); } catch(e) {} };
export const syncOfflineAlerts = async (api) => {
  const q = getOfflineQueue();
  if (q.length === 0) return { synced: 0 };
  try { const r = await api.post('/alerts/batch', { alerts: q }); clearOfflineQueue(); return { synced: r.data.synced }; }
  catch(e) { return { synced: 0, error: e.message }; }
};
