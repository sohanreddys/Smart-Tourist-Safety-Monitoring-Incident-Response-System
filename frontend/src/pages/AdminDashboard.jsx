import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket } from '../services/socket';
import api from '../services/api';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const userMarkersRef = useRef({});
  const geofenceCirclesRef = useRef([]);
  const [alerts, setAlerts] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [blockchainLogs, setBlockchainLogs] = useState([]);
  const [chainValid, setChainValid] = useState(null);
  const [stats, setStats] = useState({ totalAlerts: 0, active: 0, resolved: 0, users: 0 });
  const [activeTab, setActiveTab] = useState('overview');
  const [newFence, setNewFence] = useState({ name: '', lat: '', lng: '', radius: 500, riskLevel: 'medium', description: '' });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [alertEvidence, setAlertEvidence] = useState([]);
  const selectedAlertRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(user);
    socket.on('sos:received', (alertData) => {
      setLiveAlerts((prev) => [alertData, ...prev].slice(0, 50));
      loadAlerts();
      playAlertSound();
    });
    socket.on('location:live', (data) => { updateUserOnMap(data); });
    socket.on('user:online', (userData) => {
      setOnlineUsers((prev) => {
        const filtered = prev.filter((u) => u.id !== userData.id);
        return [...filtered, userData];
      });
    });
    socket.on('user:offline', (data) => {
      setOnlineUsers((prev) => prev.filter((u) => u.id !== data.userId));
      removeUserFromMap(data.userId);
    });
    socket.on('geofence:alert', (data) => {
      setLiveAlerts((prev) => [
        { ...data, type: 'geofence', message: 'Geofence violation: ' + (data.userName || 'Unknown') + ' entered restricted zone' },
        ...prev,
      ].slice(0, 50));
    });
    socket.on('anomaly:alert', (data) => {
      setLiveAlerts((prev) => [
        { ...data, type: 'anomaly', message: 'Anomaly detected for ' + data.userName },
        ...prev,
      ].slice(0, 50));
    });
    socket.on('alert:status_changed', (data) => {
      loadAlerts();
      setLiveAlerts((prev) => [
        { type: data.status === 'cancelled' ? 'cancelled' : 'resolved', message: 'Alert ' + data.status + ' by ' + (data.resolvedBy || data.userName || 'user'), receivedAt: data.resolvedAt || data.cancelledAt, userName: data.resolvedBy || data.userName || 'System' },
        ...prev,
      ].slice(0, 50));
    });
    socket.on('evidence:uploaded', (data) => {
      setLiveAlerts((prev) => [
        { type: 'evidence', message: 'Evidence clip #' + data.clipIndex + ' uploaded by ' + data.userName + ' (' + data.cameraType + ' cam)', receivedAt: data.uploadedAt, userName: data.userName },
        ...prev,
      ].slice(0, 50));
      // Use ref so the closure always sees the current selected alert
      if (selectedAlertRef.current && selectedAlertRef.current.id === data.alertId) {
        loadEvidence(data.alertId);
      }
    });
    socket.on('blockchain:new_id', (data) => {
      setLiveAlerts((prev) => [
        { type: 'blockchain', message: 'New Digital ID: ' + data.userName + ' (' + data.touristIdNumber + ')', receivedAt: data.issuedAt, userName: 'System' },
        ...prev,
      ].slice(0, 50));
    });
    return () => disconnectSocket();
  }, [user, selectedAlert]);

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 300);
    } catch (e) {}
  };

  useEffect(() => {
    if (activeTab !== 'map') return;
    if (!mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    const L = window.L;
    if (!L) return;
    const map = L.map(mapRef.current).setView([17.385, 78.4867], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    mapInstance.current = map;
    loadGeofences();
    loadAllUsers();
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [activeTab]);

  const updateUserOnMap = useCallback((data) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    if (userMarkersRef.current[data.userId]) {
      userMarkersRef.current[data.userId].setLatLng([data.lat, data.lng]);
    } else {
      const icon = L.divIcon({
        html: '<div style="background:#22c55e;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [12, 12], className: '',
      });
      const marker = L.marker([data.lat, data.lng], { icon }).addTo(mapInstance.current);
      marker.bindPopup('<b>' + (data.userName || 'Tourist') + '</b>');
      userMarkersRef.current[data.userId] = marker;
    }
  }, []);

  const removeUserFromMap = (userId) => {
    if (userMarkersRef.current[userId]) {
      userMarkersRef.current[userId].remove();
      delete userMarkersRef.current[userId];
    }
  };

  const loadAlerts = async () => {
    try {
      const res = await api.get('/alerts');
      const allAlerts = res.data.alerts || [];
      setAlerts(allAlerts);
      setStats((prev) => ({
        ...prev,
        totalAlerts: allAlerts.length,
        active: allAlerts.filter((a) => a.status === 'active').length,
        resolved: allAlerts.filter((a) => a.status === 'resolved').length,
      }));
    } catch (e) {}
  };

  const loadGeofences = async () => {
    try {
      const res = await api.get('/geofence');
      setGeofences(res.data.geofences || []);
      renderGeofencesOnMap(res.data.geofences);
    } catch (e) {}
  };

  const loadAllUsers = async () => {
    try {
      const res = await api.get('/location/all-users');
      const users = res.data.users || [];
      setStats((prev) => ({ ...prev, users: users.length }));
      users.forEach((u) => {
        if (u.lastLocation) {
          updateUserOnMap({ userId: u.id, userName: u.name, lat: u.lastLocation.lat, lng: u.lastLocation.lng });
        }
      });
    } catch (e) {}
  };

  const loadBlockchainLogs = async () => {
    try {
      const [logsRes, verifyRes] = await Promise.all([
        api.get('/blockchain/logs'),
        api.get('/blockchain/verify'),
      ]);
      setBlockchainLogs(logsRes.data.logs || []);
      setChainValid(verifyRes.data.valid);
    } catch (e) {}
  };

  const loadEvidence = async (alertId) => {
    try {
      const res = await api.get('/evidence/' + alertId);
      setAlertEvidence(res.data.evidence || []);
    } catch (e) {}
  };

  const viewAlertDetails = async (alert) => {
    setSelectedAlert(alert);
    selectedAlertRef.current = alert;
    await loadEvidence(alert.id);
    setActiveTab('alert-detail');
  };

  const resolveAlert = async (alertId) => {
    try { await api.patch('/alerts/' + alertId + '/resolve'); loadAlerts(); } catch (e) {}
  };

  const assignAlert = async (alertId, role) => {
    try {
      await api.post('/alerts/' + alertId + '/assign', { role });
      loadAlerts();
      if (selectedAlert && selectedAlert.id === alertId) {
        const r = await api.get('/alerts/' + alertId);
        setSelectedAlert(r.data.alert);
      }
    } catch (e) { alert('Failed to assign: ' + (e.response?.data?.error || e.message)); }
  };

  const createGeofence = async (e) => {
    e.preventDefault();
    try {
      await api.post('/geofence', newFence);
      setNewFence({ name: '', lat: '', lng: '', radius: 500, riskLevel: 'medium', description: '' });
      loadGeofences();
    } catch (e) {}
  };

  const deleteGeofence = async (id) => {
    try { await api.delete('/geofence/' + id); loadGeofences(); } catch (e) {}
  };

  const renderGeofencesOnMap = (fences) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    geofenceCirclesRef.current.forEach((c) => c.remove());
    geofenceCirclesRef.current = [];
    fences.forEach((f) => {
      const color = f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6';
      const circle = L.circle([f.lat, f.lng], { radius: f.radius, color, fillColor: color, fillOpacity: 0.15, weight: 2 })
        .addTo(mapInstance.current);
      circle.bindPopup('<b>' + f.name + '</b><br>Risk: ' + f.riskLevel);
      geofenceCirclesRef.current.push(circle);
    });
  };

  useEffect(() => {
    loadAlerts();
    loadBlockchainLogs();
    const interval = setInterval(() => { loadAlerts(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-900 text-white shadow-lg">
        <div className="max-w-full mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg">WanderMate Admin</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-300">{user?.name}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="text-sm bg-white/20 px-3 py-1 rounded hover:bg-white/30">Logout</button>
          </div>
        </div>
      </nav>

      {liveAlerts.length > 0 && liveAlerts[0].type === 'sos' && (
        <div className="bg-red-600 text-white px-4 py-3 text-center font-bold animate-pulse">
          LIVE SOS: {liveAlerts[0].userName} triggered emergency! — Lat: {liveAlerts[0].lat?.toFixed(4)}, Lng: {liveAlerts[0].lng?.toFixed(4)}
          {liveAlerts[0].recordingActive && <span className="ml-2 bg-red-800 px-2 py-0.5 rounded text-xs">RECORDING</span>}
        </div>
      )}

      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-4 flex space-x-1 overflow-x-auto">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'map', label: 'Live Map' },
            { key: 'alerts', label: 'Alerts (' + stats.active + ')' },
            { key: 'geofences', label: 'Geofences' },
            { key: 'blockchain', label: 'Blockchain' },
            { key: 'logs', label: 'Activity Log' },
            ...(selectedAlert ? [{ key: 'alert-detail', label: 'Alert Detail' }] : []),
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ' +
                (activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-full mx-auto px-4 py-4">

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Active Alerts', value: stats.active, color: 'bg-red-500' },
                { label: 'Total Alerts', value: stats.totalAlerts, color: 'bg-orange-500' },
                { label: 'Resolved', value: stats.resolved, color: 'bg-green-500' },
                { label: 'Tracked Users', value: stats.users, color: 'bg-blue-500' },
              ].map((s, i) => (
                <div key={i} className={s.color + ' text-white rounded-2xl p-5 shadow-lg'}>
                  <div className="text-3xl font-extrabold">{s.value}</div>
                  <div className="text-sm opacity-80">{s.label}</div>
                </div>
              ))}
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-3">Recent Live Feed</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {liveAlerts.length === 0 ? (
                <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No live alerts yet. Monitoring...</p>
              ) : (
                liveAlerts.map((a, i) => (
                  <div key={i} className={'p-3 rounded-xl text-sm cursor-pointer hover:shadow-md transition-shadow ' +
                    (a.type === 'sos' ? 'bg-red-50 border border-red-200' :
                     a.type === 'geofence' ? 'bg-yellow-50 border border-yellow-200' :
                     a.type === 'resolved' || a.type === 'cancelled' ? 'bg-green-50 border border-green-200' :
                     a.type === 'evidence' ? 'bg-orange-50 border border-orange-200' :
                     a.type === 'blockchain' ? 'bg-blue-50 border border-blue-200' :
                     'bg-purple-50 border border-purple-200')}>
                    <span className="font-medium">{a.userName || 'System'}</span>: {a.message}
                    <span className="text-xs text-gray-400 ml-2">
                      {a.receivedAt ? new Date(a.receivedAt).toLocaleTimeString() : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MAP */}
        {activeTab === 'map' && (
          <div>
            <div ref={mapRef} style={{ width: '100%', height: '600px' }} className="rounded-2xl shadow-lg border border-gray-200" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => { loadAllUsers(); }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Refresh Users</button>
              <button onClick={loadGeofences} className="px-4 py-2 bg-yellow-500 text-white text-sm rounded-lg">Show Geofences</button>
            </div>
          </div>
        )}

        {/* ALERTS — with click to view details */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">All Alerts</h2>
              <button onClick={loadAlerts} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
            </div>
            {alerts.length === 0 && <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No alerts yet.</p>}
            {alerts.map((a) => (
              <div key={a.id}
                onClick={() => viewAlertDetails(a)}
                className={'p-4 rounded-xl border bg-white shadow-sm cursor-pointer hover:shadow-md transition-all ' +
                  (a.status === 'active' ? 'border-l-4 border-l-red-500' :
                   a.status === 'cancelled' ? 'border-l-4 border-l-yellow-500' :
                   'border-l-4 border-l-green-500')}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={'text-xs font-bold px-2 py-1 rounded ' +
                        (a.status === 'active' ? 'bg-red-100 text-red-800' :
                         a.status === 'cancelled' ? 'bg-yellow-100 text-yellow-800' :
                         'bg-green-100 text-green-800')}>
                        {a.status?.toUpperCase()}
                      </span>
                      <span className={'text-xs font-medium px-2 py-0.5 rounded ' +
                        (a.priority === 'critical' ? 'bg-red-200 text-red-900' : 'bg-yellow-200 text-yellow-900')}>
                        {a.priority}
                      </span>
                      {a.recordingActive && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded animate-pulse font-bold">REC</span>}
                      {a.evidenceCount > 0 && <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">{a.evidenceCount} clips</span>}
                      {a.offlineSync && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Offline</span>}
                    </div>
                    <p className="font-medium text-gray-800 mt-2">{a.userName} — {a.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {a.userEmail} | {a.lat?.toFixed(4)}, {a.lng?.toFixed(4)} | {new Date(a.createdAt).toLocaleString()}
                    </p>
                    {/* User snapshot highlights */}
                    {a.userSnapshot && (a.userSnapshot.bloodGroup || a.userSnapshot.emergencyContactPhone) && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {a.userSnapshot.bloodGroup && (
                          <span className="text-xs bg-pink-100 text-pink-800 px-2 py-0.5 rounded font-bold">Blood: {a.userSnapshot.bloodGroup}</span>
                        )}
                        {a.userSnapshot.emergencyContactPhone && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                            Emergency: {a.userSnapshot.emergencyContactName || 'Contact'} ({a.userSnapshot.emergencyContactPhone})
                          </span>
                        )}
                        {a.userSnapshot.medicalConditions && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Medical: {a.userSnapshot.medicalConditions}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-3">
                    {a.status === 'active' && (
                      <button onClick={(e) => { e.stopPropagation(); resolveAlert(a.id); }}
                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                        Resolve
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); viewAlertDetails(a); }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300">
                      Details
                    </button>
                  </div>
                </div>
                {a.resolvedBy && (
                  <p className="text-xs text-green-600 mt-2">Resolved by {a.resolvedBy} at {new Date(a.resolvedAt).toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ALERT DETAIL VIEW */}
        {activeTab === 'alert-detail' && selectedAlert && (
          <div>
            <button onClick={() => { setActiveTab('alerts'); setSelectedAlert(null); }}
              className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Alerts</button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Main alert info */}
              <div className="lg:col-span-2 space-y-4">
                <div className={'bg-white rounded-xl p-5 border shadow-sm ' +
                  (selectedAlert.status === 'active' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500')}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={'text-sm font-bold px-3 py-1 rounded ' +
                      (selectedAlert.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')}>
                      {selectedAlert.status?.toUpperCase()}
                    </span>
                    <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded">{selectedAlert.type?.toUpperCase()}</span>
                    {selectedAlert.recordingActive && <span className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded animate-pulse font-bold">RECORDING ACTIVE</span>}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedAlert.userName}</h2>
                  <p className="text-gray-600">{selectedAlert.message}</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Created: {new Date(selectedAlert.createdAt).toLocaleString()} | Email: {selectedAlert.userEmail}
                  </p>

                  {/* Location details */}
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Latitude</div>
                      <div className="font-bold text-sm">{selectedAlert.lat?.toFixed(6) || 'N/A'}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Longitude</div>
                      <div className="font-bold text-sm">{selectedAlert.lng?.toFixed(6) || 'N/A'}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Accuracy</div>
                      <div className="font-bold text-sm">{selectedAlert.accuracy ? '±' + Math.round(selectedAlert.accuracy) + 'm' : 'N/A'}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Speed</div>
                      <div className="font-bold text-sm">{selectedAlert.speed ? (selectedAlert.speed * 3.6).toFixed(1) + ' km/h' : 'Stationary'}</div>
                    </div>
                  </div>

                  {selectedAlert.lat && selectedAlert.lng && (
                    <a href={'https://www.google.com/maps?q=' + selectedAlert.lat + ',' + selectedAlert.lng}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm text-blue-600 hover:underline font-medium">
                      Open in Google Maps
                    </a>
                  )}

                  {selectedAlert.status === 'active' && (
                    <button onClick={() => resolveAlert(selectedAlert.id)}
                      className="mt-4 w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">
                      Resolve This Alert
                    </button>
                  )}
                </div>

                {/* Evidence Section */}
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800">Evidence Recordings ({alertEvidence.length})</h3>
                    <button onClick={() => loadEvidence(selectedAlert.id)}
                      className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
                  </div>
                  <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <p className="text-xs font-bold text-indigo-900 mb-2">ASSIGN TO DEPARTMENT</p>
                    {selectedAlert?.assignedRole ? (
                      <p className="text-xs text-indigo-700 mb-2">
                        Currently assigned to: <span className="font-bold uppercase">{selectedAlert.assignedRole}</span>
                        {selectedAlert.assignedBy ? ' by ' + selectedAlert.assignedBy : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-indigo-600 mb-2">Not yet assigned.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {['medical', 'police', 'fire', 'disaster'].map((r) => (
                        <button key={r} onClick={() => assignAlert(selectedAlert.id, r)}
                          className="text-xs font-bold px-3 py-1.5 rounded bg-white border border-indigo-300 hover:bg-indigo-100 uppercase">
                          {r === 'medical' ? '🏥 Medical' : r === 'police' ? '👮 Police' : r === 'fire' ? '🚒 Fire' : '🌪️ Disaster'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {alertEvidence.length === 0 ? (
                    <p className="text-gray-500 text-sm">No evidence uploaded yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {alertEvidence.map((ev, i) => (
                        <div key={ev.id} className="bg-gray-50 rounded-lg p-4 border">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-gray-700">Clip #{ev.clipIndex || i + 1}</span>
                            <span className={'text-xs px-2 py-0.5 rounded ' +
                              (ev.cameraType === 'front' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800')}>
                              {ev.cameraType?.toUpperCase()} CAM
                            </span>
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">{ev.type}</span>
                          </div>
                          {ev.type === 'video' && (
                            <video controls className="w-full rounded-lg mb-2" style={{ maxHeight: '200px' }}>
                              <source src={api.defaults.baseURL.replace('/api', '') + ev.url + '?token=' + encodeURIComponent(localStorage.getItem('wandermate_token') || '')} type={ev.mimeType || 'video/mp4'} />
                              Your browser does not support video playback.
                            </video>
                          )}
                          {ev.type === 'audio' && (
                            <audio controls className="w-full mb-2">
                              <source src={api.defaults.baseURL.replace('/api', '') + ev.url + '?token=' + encodeURIComponent(localStorage.getItem('wandermate_token') || '')} type={ev.mimeType || 'audio/mpeg'} />
                            </audio>
                          )}
                          <div className="text-xs text-gray-400 flex justify-between">
                            <span>Size: {formatBytes(ev.size)}</span>
                            <span>{new Date(ev.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar — User Profile + Device Info */}
              <div className="space-y-4">
                {/* Device Info */}
                {selectedAlert.deviceInfo && (selectedAlert.deviceInfo.model || selectedAlert.deviceInfo.os) && (
                  <div className="bg-white rounded-xl p-5 border shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">Device at Time of Alert</h3>
                    <div className="space-y-2 text-sm">
                      <InfoRow label="Device" value={selectedAlert.deviceInfo.model} />
                      <InfoRow label="OS" value={selectedAlert.deviceInfo.os} />
                      <InfoRow label="Battery" value={selectedAlert.deviceInfo.battery != null ? selectedAlert.deviceInfo.battery + '%' : 'N/A'} />
                      <InfoRow label="Charging" value={selectedAlert.deviceInfo.isCharging ? 'Yes' : 'No'} />
                      <InfoRow label="Network" value={selectedAlert.deviceInfo.networkType} />
                    </div>
                  </div>
                )}

                {/* User Profile Snapshot */}
                {selectedAlert.userSnapshot && (
                  <div className="bg-white rounded-xl p-5 border shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">Tourist Profile</h3>
                    <div className="space-y-2 text-sm">
                      <InfoRow label="Phone" value={selectedAlert.userSnapshot.phone} />
                      <InfoRow label="Blood Group" value={selectedAlert.userSnapshot.bloodGroup} highlight />
                      <InfoRow label="Gender" value={selectedAlert.userSnapshot.gender} />
                      <InfoRow label="Nationality" value={selectedAlert.userSnapshot.nationality} />
                      <InfoRow label="DOB" value={selectedAlert.userSnapshot.dateOfBirth} />
                      <InfoRow label="Address" value={selectedAlert.userSnapshot.address} />
                    </div>
                    {selectedAlert.userSnapshot.medicalConditions && (
                      <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="text-xs font-bold text-yellow-800 mb-1">MEDICAL CONDITIONS</div>
                        <div className="text-sm text-yellow-900">{selectedAlert.userSnapshot.medicalConditions}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Emergency Contact */}
                {selectedAlert.userSnapshot?.emergencyContactPhone && (
                  <div className="bg-red-50 rounded-xl p-5 border border-red-200 shadow-sm">
                    <h3 className="font-bold text-red-800 mb-3 text-sm uppercase tracking-wide">Emergency Contact</h3>
                    <p className="font-bold text-lg text-gray-900">{selectedAlert.userSnapshot.emergencyContactName || 'Unknown'}</p>
                    <p className="text-sm text-gray-600">{selectedAlert.userSnapshot.emergencyContactRelation || 'Relation not specified'}</p>
                    <a href={'tel:' + selectedAlert.userSnapshot.emergencyContactPhone}
                      className="mt-3 block w-full text-center py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">
                      Call {selectedAlert.userSnapshot.emergencyContactPhone}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* GEOFENCES */}
        {activeTab === 'geofences' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Geofence Management</h2>
            <form onSubmit={createGeofence} className="bg-white p-4 rounded-xl border shadow-sm mb-6">
              <h3 className="font-bold text-gray-700 mb-3">Create New Geofence</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={newFence.name} onChange={(e) => setNewFence({ ...newFence, name: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Zone name" required />
                <input value={newFence.lat} onChange={(e) => setNewFence({ ...newFence, lat: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Latitude" required type="number" step="any" />
                <input value={newFence.lng} onChange={(e) => setNewFence({ ...newFence, lng: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Longitude" required type="number" step="any" />
                <input value={newFence.radius} onChange={(e) => setNewFence({ ...newFence, radius: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Radius (m)" type="number" />
                <select value={newFence.riskLevel} onChange={(e) => setNewFence({ ...newFence, riskLevel: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm">
                  <option value="low">Low Risk</option><option value="medium">Medium Risk</option><option value="high">High Risk</option>
                </select>
                <input value={newFence.description} onChange={(e) => setNewFence({ ...newFence, description: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Description" />
              </div>
              <button type="submit" className="mt-3 px-6 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600">
                + Create Geofence
              </button>
            </form>
            <div className="space-y-3">
              {geofences.map((f) => (
                <div key={f.id} className={'p-4 rounded-xl border bg-white shadow-sm flex justify-between items-center ' +
                  (f.riskLevel === 'high' ? 'border-l-4 border-l-red-500' :
                   f.riskLevel === 'medium' ? 'border-l-4 border-l-yellow-500' : 'border-l-4 border-l-blue-500')}>
                  <div>
                    <h4 className="font-bold text-gray-800">{f.name}</h4>
                    <p className="text-sm text-gray-500">{f.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{f.lat.toFixed(4)}, {f.lng.toFixed(4)} | Radius: {f.radius}m | Risk: {f.riskLevel}</p>
                  </div>
                  <button onClick={() => deleteGeofence(f.id)} className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BLOCKCHAIN */}
        {activeTab === 'blockchain' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Blockchain Ledger</h2>
              <div className="flex items-center gap-3">
                <span className={'text-sm font-medium px-3 py-1 rounded-lg ' +
                  (chainValid ? 'bg-green-100 text-green-800' : chainValid === false ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600')}>
                  {chainValid ? 'Chain Valid' : chainValid === false ? 'Chain Broken' : 'Checking...'}
                </span>
                <button onClick={loadBlockchainLogs} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
              </div>
            </div>
            <div className="space-y-2">
              {blockchainLogs.map((block) => (
                <div key={block.id} className="bg-white p-4 rounded-xl border shadow-sm">
                  <div className="flex justify-between">
                    <span className="text-xs font-bold text-blue-600">Block #{block.index}</span>
                    <span className={'text-xs px-2 py-0.5 rounded ' +
                      (block.type === 'digital_id' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600')}>
                      {block.type === 'digital_id' ? 'Digital ID' : 'Log'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-1">{block.userName} — {block.action || 'Digital ID Issued'}</p>
                  <p className="text-xs text-gray-400 mt-1 font-mono truncate">Hash: {block.hash}</p>
                  <p className="text-xs text-gray-300 font-mono truncate">Prev: {block.previousHash}</p>
                </div>
              ))}
              {blockchainLogs.length === 0 && <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No blockchain entries yet.</p>}
            </div>
          </div>
        )}

        {/* ACTIVITY LOG */}
        {activeTab === 'logs' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">All Activity Log</h2>
            <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Time</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">User</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Message</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => viewAlertDetails(a)}>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">{a.userName}</td>
                      <td className="px-4 py-3">
                        <span className={'text-xs px-2 py-0.5 rounded ' +
                          (a.type === 'sos' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')}>{a.type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.message}</td>
                      <td className="px-4 py-3">
                        <span className={'text-xs font-medium ' +
                          (a.status === 'active' ? 'text-red-600' : a.status === 'cancelled' ? 'text-yellow-600' : 'text-green-600')}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{a.evidenceCount > 0 ? a.evidenceCount + ' clips' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alerts.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No activity logs yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InfoRow = ({ label, value, highlight }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-50">
    <span className="text-gray-500">{label}</span>
    <span className={'font-medium text-right max-w-[60%] ' + (highlight && value ? 'text-red-700 font-bold' : 'text-gray-900')}>
      {value || 'Not set'}
    </span>
  </div>
);

export default AdminDashboard;
