import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import { isOnline, saveOfflineAlert, getOfflineQueue, syncOfflineAlerts } from '../utils/offline';
import api from '../services/api';

const Dashboard = () => {
  const { user, logout, updateProfile, refreshUser } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const serviceMarkersRef = useRef([]);
  const geofenceCirclesRef = useRef([]);
  const [location, setLocation] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [services, setServices] = useState([]);
  const [helplines, setHelplines] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [geofenceWarning, setGeofenceWarning] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [digitalId, setDigitalId] = useState(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [networkStatus, setNetworkStatus] = useState(navigator.onLine);
  const [resolvedNotif, setResolvedNotif] = useState(null);
  const [activeTab, setActiveTab] = useState('map');
  const [profileForm, setProfileForm] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  useEffect(() => {
    if (user) {
      const socket = connectSocket(user);
      socket.on('sos:acknowledged', (data) => {
        console.log('SOS Acknowledged:', data.message);
      });
      socket.on('alert:resolved', (data) => {
        setResolvedNotif(data.message);
        setTimeout(() => setResolvedNotif(null), 5000);
        loadAlerts();
      });
    }
    return () => disconnectSocket();
  }, [user]);

  useEffect(() => {
    const handleOnline = async () => {
      setNetworkStatus(true);
      const result = await syncOfflineAlerts(api);
      if (result.synced > 0) {
        setOfflineCount(0);
        loadAlerts();
      }
    };
    const handleOffline = () => setNetworkStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOfflineCount(getOfflineQueue().length);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'map') return;
    if (!mapRef.current) return;

    const L = window.L;
    if (!L) return;

    // Remove old map instance if exists
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    // Create new map
    const map = L.map(mapRef.current).setView([17.385, 78.4867], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Invalidate size to ensure map fills container
    setTimeout(() => map.invalidateSize(), 100);

    mapInstance.current = map;
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [activeTab]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setLocation(loc);
        updateLocationOnMap(loc);
        sendLocationToServer(loc);
        checkGeofences(loc);
      },
      (err) => {
        console.error('Geolocation error:', err);
        const fallback = { lat: 17.385, lng: 78.4867, accuracy: 100 };
        setLocation(fallback);
        updateLocationOnMap(fallback);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const updateLocationOnMap = useCallback((loc) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([loc.lat, loc.lng]);
    } else {
      const icon = L.divIcon({
        html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [16, 16],
        className: '',
      });
      markerRef.current = L.marker([loc.lat, loc.lng], { icon }).addTo(mapInstance.current);
      markerRef.current.bindPopup('<b>You are here</b>');
      mapInstance.current.setView([loc.lat, loc.lng], 15);
    }
  }, []);

  const sendLocationToServer = async (loc) => {
    try {
      if (isOnline()) {
        await api.post('/location/update', loc);
        const socket = getSocket();
        if (socket) {
          socket.emit('location:update', { userId: user.id, userName: user.name, ...loc });
        }
      }
    } catch (err) {
      console.error('Failed to send location:', err);
    }
  };

  const checkGeofences = async (loc) => {
    try {
      if (!isOnline()) return;
      const res = await api.post('/geofence/check', { lat: loc.lat, lng: loc.lng });
      if (res.data.insideGeofence) {
        const violation = res.data.violations[0];
        setGeofenceWarning(violation);
        const socket = getSocket();
        if (socket) {
          socket.emit('geofence:violation', {
            userId: user.id, userName: user.name,
            geofence: violation.name, riskLevel: violation.riskLevel,
            lat: loc.lat, lng: loc.lng,
          });
        }
      } else {
        setGeofenceWarning(null);
      }
    } catch (err) {
      console.error('Geofence check error:', err);
    }
  };

  const loadAlerts = async () => {
    try { const res = await api.get('/alerts'); setAlerts(res.data.alerts || []); } catch {}
  };

  const loadGeofences = async () => {
    try {
      const res = await api.get('/geofence');
      setGeofences(res.data.geofences || []);
      renderGeofencesOnMap(res.data.geofences);
    } catch {}
  };

  const loadServices = async () => {
    try {
      const lat = location?.lat || 17.385;
      const lng = location?.lng || 78.4867;
      const res = await api.get('/location/nearby-services?lat=' + lat + '&lng=' + lng);
      setServices(res.data.services || []);
      setHelplines(res.data.nationalHelplines || []);
      renderServicesOnMap(res.data.services);
    } catch {}
  };

  const loadDigitalId = async () => {
    try { const res = await api.post('/blockchain/digital-id'); setDigitalId(res.data.digitalId); } catch {}
  };

  const checkAnomalies = async () => {
    try { const res = await api.post('/anomaly/check', { userId: user.id }); setAnomalies(res.data.anomalies || []); } catch {}
  };

  useEffect(() => {
    loadAlerts();
    loadGeofences();
    loadDigitalId();
    const interval = setInterval(() => { checkAnomalies(); }, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderGeofencesOnMap = (fences) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    geofenceCirclesRef.current.forEach((c) => c.remove());
    geofenceCirclesRef.current = [];
    fences.forEach((f) => {
      const color = f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6';
      const circle = L.circle([f.lat, f.lng], { radius: f.radius, color, fillColor: color, fillOpacity: 0.15, weight: 2 })
        .addTo(mapInstance.current);
      circle.bindPopup('<b>' + f.name + '</b><br>Risk: ' + f.riskLevel + '<br>' + f.description);
      geofenceCirclesRef.current.push(circle);
    });
  };

  const renderServicesOnMap = (svcs) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    serviceMarkersRef.current.forEach((m) => m.remove());
    serviceMarkersRef.current = [];
    const icons = { hospital: '&#x1f3e5;', police: '&#x1f46e;', fire: '&#x1f692;', info: '&#x2139;&#xfe0f;', pharmacy: '&#x1f48a;' };
    svcs.forEach((s) => {
      const icon = L.divIcon({
        html: '<div style="font-size:20px;text-align:center">' + (icons[s.type] || 'Pin') + '</div>',
        iconSize: [28, 28], className: '',
      });
      const marker = L.marker([s.lat, s.lng], { icon }).addTo(mapInstance.current);
      marker.bindPopup('<b>' + s.name + '</b><br>Phone: ' + s.phone + '<br>' + s.distance);
      serviceMarkersRef.current.push(marker);
    });
  };

  const handleSOS = async () => {
    setSosActive(true);
    const alertData = {
      type: 'sos',
      message: 'Emergency SOS triggered!',
      lat: location?.lat,
      lng: location?.lng,
    };

    if (isOnline()) {
      try {
        await api.post('/alerts/sos', alertData);
        const socket = getSocket();
        if (socket) {
          socket.emit('sos:trigger', { ...alertData, userId: user.id, userName: user.name });
        }
        await api.post('/blockchain/log', { action: 'SOS_TRIGGERED', details: 'SOS at ' + (location?.lat?.toFixed(4)) + ', ' + (location?.lng?.toFixed(4)) });
        loadAlerts();
      } catch (err) {
        console.error('SOS API error:', err);
      }
    } else {
      saveOfflineAlert(alertData);
      setOfflineCount(getOfflineQueue().length);
    }

    setTimeout(() => setSosActive(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center space-x-2">
            <span className="text-xl">&#x1f6e1;&#xfe0f;</span>
            <span className="font-bold">WanderMate</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className={'inline-block w-2 h-2 rounded-full ' + (networkStatus ? 'bg-green-400' : 'bg-red-400')}></span>
            <span className="text-sm">{user?.name}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="text-sm bg-white/20 px-3 py-1 rounded hover:bg-white/30">Logout</button>
          </div>
        </div>
      </nav>

      {geofenceWarning && (
        <div className="bg-red-600 text-white px-4 py-3 text-center font-medium animate-pulse">
          WARNING: You are inside a restricted zone — <b>{geofenceWarning.name}</b> (Risk: {geofenceWarning.riskLevel})
        </div>
      )}

      {resolvedNotif && (
        <div className="bg-green-600 text-white px-4 py-3 text-center font-medium">{resolvedNotif}</div>
      )}

      {offlineCount > 0 && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm">
          {offlineCount} offline alert(s) pending sync. Will sync when back online.
        </div>
      )}

      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex space-x-1 overflow-x-auto">
          {[
            { key: 'map', label: 'Map' },
            { key: 'alerts', label: 'Alerts' },
            { key: 'id', label: 'Digital ID' },
            { key: 'services', label: 'Services' },
            { key: 'profile', label: 'Profile' },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ' +
                (activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="mb-4">
          <button onClick={handleSOS} disabled={sosActive}
            className={'w-full py-4 rounded-2xl text-white text-xl font-extrabold shadow-lg transition-all ' +
              (sosActive ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-95 hover:shadow-xl')}>
            {sosActive ? 'SOS SENT — Help is on the way!' : 'SOS — EMERGENCY PANIC BUTTON'}
          </button>
        </div>

        {activeTab === 'map' && (
          <div className="space-y-4">
            <div ref={mapRef} className="w-full rounded-2xl shadow-lg border border-gray-200 z-0" style={{ height: '600px', minHeight: '600px' }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={loadServices} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Show Nearby Services</button>
              <button onClick={loadGeofences} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600">Show Risk Zones</button>
              <button onClick={checkAnomalies} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">Run AI Check</button>
            </div>
            {location && (
              <p className="text-xs text-gray-400 mt-2">Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)} | Accuracy: +/-{Math.round(location.accuracy || 0)}m</p>
            )}
            {anomalies.length > 0 && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
                <h3 className="font-bold text-purple-800 mb-2">AI Anomaly Detection Results</h3>
                {anomalies.map((a, i) => (
                  <div key={i} className={'p-3 rounded-lg mb-2 text-sm ' +
                    (a.severity === 'critical' ? 'bg-red-100 text-red-800' :
                     a.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                     a.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800')}>
                    <span className="font-medium">[{a.severity.toUpperCase()}]</span> {a.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800">Your Alerts</h2>
            {alerts.length === 0 ? (
              <p className="text-gray-500 text-sm">No alerts yet. Stay safe!</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={'p-4 rounded-xl border ' + (a.status === 'active' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200')}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={'text-xs font-bold px-2 py-1 rounded ' + (a.status === 'active' ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800')}>
                        {a.status === 'active' ? 'ACTIVE' : 'RESOLVED'}
                      </span>
                      <p className="mt-2 text-sm text-gray-700">{a.message}</p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                  {a.resolvedBy && <p className="text-xs text-green-600 mt-1">Resolved by {a.resolvedBy}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'id' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Blockchain Digital Tourist ID</h2>
            {digitalId ? (
              <div>
                <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-700 text-white rounded-2xl p-6 shadow-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-blue-300 font-medium tracking-wider">GOVERNMENT OF INDIA - DIGITAL TOURIST ID</p>
                      <h3 className="text-2xl font-bold mt-2">{digitalId.userName}</h3>
                      <p className="text-sm text-blue-200 mt-1">{digitalId.userEmail}</p>
                      {digitalId.touristIdNumber && (
                        <p className="text-lg font-mono font-bold text-yellow-300 mt-2">{digitalId.touristIdNumber}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-300">Block #{digitalId.index}</p>
                      <span className="inline-block mt-1 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-bold">VERIFIED</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-blue-300">Phone</p>
                      <p className="text-sm font-medium">{digitalId.userPhone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">Issued By</p>
                      <p className="text-sm font-medium">{digitalId.issuedBy || 'WanderMate Authority'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">Issued On</p>
                      <p className="text-sm font-medium">{new Date(digitalId.issuedAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">Expires On</p>
                      <p className="text-sm font-medium">{digitalId.expiresAt ? new Date(digitalId.expiresAt).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>

                  {digitalId.verificationCode && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <p className="text-xs text-blue-300">Verification Code</p>
                      <p className="text-lg font-mono font-bold tracking-widest text-green-300">{digitalId.verificationCode}</p>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                    <p className="text-xs font-mono text-blue-400 truncate">SHA-256: {digitalId.hash}</p>
                    <p className="text-xs font-mono text-blue-500 truncate">Prev: {digitalId.previousHash}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-400 mt-3 text-center">This ID is blockchain-verified and tamper-proof. Share the verification code for identity verification at checkpoints.</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">Generate your blockchain-backed Digital Tourist ID for secure identity verification across India.</p>
                <button onClick={loadDigitalId} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg">Generate Digital ID</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'services' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Nearby Emergency Services</h2>
              <button onClick={loadServices} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
            </div>

            {/* National Helplines */}
            {helplines.length > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="font-bold text-red-800 mb-2">India Emergency Helplines</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {helplines.map((h) => (
                    <a key={h.id} href={'tel:' + h.phone}
                      className="bg-white p-3 rounded-lg border border-red-100 hover:bg-red-50 text-center transition-all">
                      <div className="text-xl font-extrabold text-red-600">{h.phone}</div>
                      <div className="text-xs text-gray-600 mt-1">{h.name}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3">
              {services.length === 0 ? (
                <button onClick={loadServices} className="p-8 bg-gray-100 rounded-xl text-gray-500 hover:bg-gray-200">Click to load nearby services</button>
              ) : (
                services.map((s) => (
                  <div key={s.id} className="bg-white p-4 rounded-xl border shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-800">{s.name}</h4>
                        <p className="text-sm text-gray-500">{s.type} - {s.distance}{s.city ? ' - ' + s.city : ''}</p>
                        {s.address && <p className="text-xs text-gray-400 mt-1">{s.address}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <a href={'tel:' + s.phone} className="flex-1 min-w-max bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 text-center transition-all">
                        ☎ {s.phone}
                      </a>
                      <a href={'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-max bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 text-center transition-all">
                        🗺 Directions
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">My Profile</h2>
            {profileMsg && <div className="bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{profileMsg}</div>}

            <ProfileEditor
              user={user}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              profileSaving={profileSaving}
              onSave={async () => {
                setProfileSaving(true);
                setProfileMsg('');
                try {
                  await updateProfile(profileForm);
                  setProfileMsg('Profile updated successfully!');
                  setTimeout(() => setProfileMsg(''), 3000);
                } catch (err) {
                  setProfileMsg('Failed to update profile');
                }
                setProfileSaving(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const ProfileEditor = ({ user, profileForm, setProfileForm, profileSaving, onSave }) => {
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (user && !initialized) {
      setProfileForm({
        name: user.name || '',
        phone: user.phone || '',
        nationality: user.nationality || '',
        passportNumber: user.passportNumber || '',
        dateOfBirth: user.dateOfBirth || '',
        gender: user.gender || '',
        emergencyContactName: user.emergencyContactName || '',
        emergencyContactPhone: user.emergencyContactPhone || '',
        emergencyContactRelation: user.emergencyContactRelation || '',
        address: user.address || '',
        bloodGroup: user.bloodGroup || '',
        medicalConditions: user.medicalConditions || '',
        preferredLanguage: user.preferredLanguage || 'English',
        travelPurpose: user.travelPurpose || '',
      });
      setInitialized(true);
    }
  }, [user, initialized, setProfileForm]);

  const handleChange = (e) => setProfileForm({ ...profileForm, [e.target.name]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="bg-blue-800 text-white rounded-2xl p-6 flex items-center space-x-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
        <div>
          <h3 className="text-xl font-bold">{user?.name}</h3>
          <p className="text-blue-200 text-sm">{user?.email}</p>
          <span className="inline-block mt-1 bg-white/20 text-white text-xs px-3 py-1 rounded-full font-bold">{user?.role?.toUpperCase()}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Full Name</label>
            <input type="text" name="name" value={profileForm.name || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Phone</label>
            <input type="tel" name="phone" value={profileForm.phone || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Nationality</label>
            <input type="text" name="nationality" value={profileForm.nationality || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Passport / ID Number</label>
            <input type="text" name="passportNumber" value={profileForm.passportNumber || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Date of Birth</label>
            <input type="date" name="dateOfBirth" value={profileForm.dateOfBirth || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Gender</label>
            <select name="gender" value={profileForm.gender || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Blood Group</label>
            <select name="bloodGroup" value={profileForm.bloodGroup || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Select</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Preferred Language</label>
            <select name="preferredLanguage" value={profileForm.preferredLanguage || 'English'} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="English">English</option><option value="Hindi">Hindi</option><option value="Telugu">Telugu</option>
              <option value="Tamil">Tamil</option><option value="Bengali">Bengali</option><option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">Home Address</label>
          <input type="text" name="address" value={profileForm.address || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">Travel Purpose</label>
          <input type="text" name="travelPurpose" value={profileForm.travelPurpose || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">Medical Conditions / Allergies</label>
          <textarea name="medicalConditions" value={profileForm.medicalConditions || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Emergency Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Contact Name</label>
            <input type="text" name="emergencyContactName" value={profileForm.emergencyContactName || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Contact Phone</label>
            <input type="tel" name="emergencyContactPhone" value={profileForm.emergencyContactPhone || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Relationship</label>
            <select name="emergencyContactRelation" value={profileForm.emergencyContactRelation || ''} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Select</option><option value="parent">Parent</option><option value="spouse">Spouse</option>
              <option value="sibling">Sibling</option><option value="friend">Friend</option><option value="relative">Relative</option>
            </select>
          </div>
        </div>
      </div>

      <button onClick={onSave} disabled={profileSaving}
        className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">
        {profileSaving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  );
};

export default Dashboard;
