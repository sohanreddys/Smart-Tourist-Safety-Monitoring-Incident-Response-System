// In-memory database for development
// Replace with MongoDB/PostgreSQL in production

const db = {
  users: [],
  locations: [],
  alerts: [],
  geofences: [],
  blockchainLogs: [],
  incidents: [],
};

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

module.exports = { db, generateId };
