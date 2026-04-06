const express = require('express');
const crypto = require('crypto');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

function createHash(data) { return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }

router.post('/digital-id', auth, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existing = db.blockchainLogs.find((b) => b.userId === req.user.id && b.type === 'digital_id');
  if (existing) return res.json({ digitalId: existing });
  const prevHash = db.blockchainLogs.length > 0 ? db.blockchainLogs[db.blockchainLogs.length - 1].hash : '0'.repeat(64);
  const blockData = { index: db.blockchainLogs.length + 1, type: 'digital_id', userId: user.id, userName: user.name, userEmail: user.email, userPhone: user.phone, issuedAt: new Date().toISOString(), previousHash: prevHash };
  const hash = createHash(blockData);
  const block = { ...blockData, id: generateId(), hash, verified: true };
  db.blockchainLogs.push(block);
  res.status(201).json({ digitalId: block });
});

router.post('/log', auth, (req, res) => {
  const { action, details } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });
  const prevHash = db.blockchainLogs.length > 0 ? db.blockchainLogs[db.blockchainLogs.length - 1].hash : '0'.repeat(64);
  const blockData = { index: db.blockchainLogs.length + 1, type: 'log', userId: req.user.id, userName: req.user.name, action, details: details || '', timestamp: new Date().toISOString(), previousHash: prevHash };
  const hash = createHash(blockData);
  const block = { ...blockData, id: generateId(), hash };
  db.blockchainLogs.push(block);
  res.status(201).json({ success: true, block });
});

router.get('/logs', auth, (req, res) => {
  const logs = req.user.role === 'admin' ? db.blockchainLogs : db.blockchainLogs.filter((b) => b.userId === req.user.id);
  res.json({ logs, chainLength: logs.length });
});

router.get('/verify', auth, (req, res) => {
  let valid = true;
  for (let i = 1; i < db.blockchainLogs.length; i++) {
    if (db.blockchainLogs[i].previousHash !== db.blockchainLogs[i - 1].hash) { valid = false; break; }
  }
  res.json({ valid, blocksChecked: db.blockchainLogs.length });
});

module.exports = router;
