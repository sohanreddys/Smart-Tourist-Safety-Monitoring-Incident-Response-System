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

  // Socket.io for real-time
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(user);

    socket.on('sos:received', (alertData) => {
      setLiveAlerts((prev) => [alertData, ...prev].slice(0, 50));
      loadAlerts();
      playAlertSound();
    });

    socket.on('location:live', (data) => {
      updateUserOnMap(data);
    });

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
        { ...data, type: 'geofence', message: 'Geofence violation: ' + data.userName + ' entered ' + data.geofence },
        ...prev,
      ].slice(0, 50));
    });

    socket.on('anomaly:alert', (data) => {
      setLiveAlerts((prev) => [
        { ...data, type: 'anomaly', message: 'Anomaly detected for ' + data.userName },
        ...prev,
      ].slice(0, 50));
    });

    return () => disconnectSocket();
  }, [user]);

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

  // Initialize map
  useEffect(() => {
    if (activeTab !== 'map' || !mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;
    const map = L.map(mapRef.current).setView([17.385, 78.4867], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapInstance.current = map;
    loadGeofences();
    loadAllUsers();
    return () => { map.remove(); mapInstance.current = null; };
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

  const resolveAlert = async (alertId) => {
    try {
      await api.patch('/alerts/' + alertId + '/resolve');
      loadAlerts();
    } catch (e) {}
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
    try {
      await api.delete('/geofence/' + id);
      loadGeofences();
    } catch (e) {}
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Nav */}
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

      {/* Live SOS Banner */}
      {liveAlerts.length > 0 && liveAlerts[0].type === 'sos' && (
        <div className="bg-red-600 text-white px-4 py-3 text-center font-bold animate-pulse">
          LIVE SOS: {liveAlerts[0].userName} triggered emergency! — Lat: {liveAlerts[0].lat?.toFixed(4)}, Lng: {liveAlerts[0].lng?.toFixed(4)}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-4 flex space-x-1 overflow-x-auto">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'map', label: 'Live Map' },
            { key: 'alerts', label: 'Alerts (' + stats.active + ')' },
            { key: 'geofences', label: 'Geofences' },
            { key: 'blockchain', label: 'Blockchain' },
            { key: 'logs', label: 'Activity Log' },
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
                  <div key={i} className={'p-3 rounded-xl text-sm ' +
                    (a.type === 'sos' ? 'bg-red-50 border border-red-200' :
                     a.type === 'geofence' ? 'bg-yellow-50 border border-yellow-200' :
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

        {/* LIVE MAP */}
        {activeTab === 'map' && (
          <div>
            <div ref={mapRef} style={{ width: '100%', height: '500px' }} className="rounded-2xl shadow-lg border border-gray-200" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => { loadAllUsers(); }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Refresh Users</button>
              <button onClick={loadGeofences} className="px-4 py-2 bg-yellow-500 text-white text-sm rounded-lg">Show Geofences</button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Green dots = tracked tourists | Red circles = risk zones</p>
          </div>
        )}

        {/* ALERTS */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">All Alerts</h2>
              <button onClick={loadAlerts} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
            </div>
            {alerts.length === 0 && <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No alerts yet.</p>}
            {alerts.map((a) => (
              <div key={a.id} className={'p-4 rounded-xl border bg-white shadow-sm ' +
                (a.status === 'active' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500')}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={'text-xs font-bold px-2 py-1 rounded ' +
                        (a.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')}>
                        {a.status === 'active' ? 'ACTIVE' : 'RESOLVED'}
                      </span>
                      <span className={'text-xs font-medium px-2 py-0.5 rounded ' +
                        (a.priority === 'critical' ? 'bg-red-200 text-red-900' : 'bg-yellow-200 text-yellow-900')}>
                        {a.priority}
                      </span>
                      {a.offlineSync && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Offline Sync</span>}
                    </div>
                    <p className="font-medium text-gray-800 mt-2">{a.userName} — {a.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {a.userEmail} | {a.lat?.toFixed(4)}, {a.lng?.toFixed(4)} | {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {a.status === 'active' && (
                    <button onClick={() => resolveAlert(a.id)}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex-shrink-0">
                      Resolve
                    </button>
                  )}
                </div>
                {a.resolvedBy && (
                  <p className="text-xs text-green-600 mt-2">Resolved by {a.resolvedBy} at {new Date(a.resolvedAt).toLocaleString()}</p>
                )}
              </div>
            ))}
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
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">{a.userName}</td>
                      <td className="px-4 py-3">
                        <span className={'text-xs px-2 py-0.5 rounded ' +
                          (a.type === 'sos' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')}>{a.type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.message}</td>
                      <td className="px-4 py-3">
                        <span className={'text-xs font-medium ' + (a.status === 'active' ? 'text-red-600' : 'text-green-600')}>{a.status}</span>
                      </td>
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

export default AdminDashboard;
