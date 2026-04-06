const express = require('express');
const crypto = require('crypto');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

function createHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function createMerkleRoot(blocks) {
  if (blocks.length === 0) return '0'.repeat(64);
  let hashes = blocks.map(b => b.hash);
  while (hashes.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      nextLevel.push(crypto.createHash('sha256').update(left + right).digest('hex'));
    }
    hashes = nextLevel;
  }
  return hashes[0];
}

// Generate a tourist ID number like "WM-IN-2025-XXXXXX"
function generateTouristIdNumber() {
  const year = new Date().getFullYear();
  const seq = String(db.blockchainLogs.filter(b => b.type === 'digital_id').length + 1).padStart(6, '0');
  return `WM-IN-${year}-${seq}`;
}

// Digital Tourist ID — blockchain-backed, immutable identity
router.post('/digital-id', auth, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check if already issued
  const existing = db.blockchainLogs.find((b) => b.userId === req.user.id && b.type === 'digital_id');
  if (existing) return res.json({ digitalId: existing, alreadyExists: true });

  const prevHash = db.blockchainLogs.length > 0
    ? db.blockchainLogs[db.blockchainLogs.length - 1].hash
    : '0'.repeat(64);

  const touristIdNumber = generateTouristIdNumber();

  const blockData = {
    index: db.blockchainLogs.length + 1,
    type: 'digital_id',
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userPhone: user.phone || 'Not provided',
    touristIdNumber,
    issuedAt: new Date().toISOString(),
    issuedBy: 'WanderMate Authority - Ministry of Tourism, India',
    validity: 'Valid for 1 year from date of issue',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    nationality: req.body.nationality || 'Not specified',
    emergencyContact: req.body.emergencyContact || user.phone || 'Not provided',
    bloodGroup: req.body.bloodGroup || 'Not specified',
    previousHash: prevHash,
    nonce: Math.floor(Math.random() * 1000000),
  };

  const hash = createHash(blockData);
  // Create a verification code (short hash for QR/manual verification)
  const verificationCode = hash.substring(0, 8).toUpperCase() + '-' + hash.substring(8, 16).toUpperCase();

  const block = {
    ...blockData,
    id: generateId(),
    hash,
    verificationCode,
    verified: true,
    merkleRoot: createMerkleRoot(db.blockchainLogs),
  };
  db.blockchainLogs.push(block);

  // Log the issuance
  const io = req.app.get('io');
  if (io) {
    io.to('admins').emit('blockchain:new_id', {
      userName: user.name,
      touristIdNumber,
      issuedAt: block.issuedAt,
    });
  }

  res.status(201).json({ digitalId: block });
});

// Verify a digital ID by verification code or hash
router.get('/verify-id/:code', (req, res) => {
  const code = req.params.code;
  const block = db.blockchainLogs.find(
    (b) => b.type === 'digital_id' && (b.verificationCode === code || b.hash === code || b.touristIdNumber === code)
  );

  if (!block) return res.status(404).json({ valid: false, error: 'Digital ID not found' });

  // Re-verify the hash
  const { id, hash: storedHash, verificationCode, verified, merkleRoot, ...blockData } = block;
  const recomputedHash = createHash(blockData);
  const hashValid = recomputedHash === storedHash;

  // Check expiry
  const expired = new Date(block.expiresAt) < new Date();

  res.json({
    valid: hashValid && !expired,
    hashIntegrity: hashValid,
    expired,
    digitalId: {
      touristIdNumber: block.touristIdNumber,
      userName: block.userName,
      userEmail: block.userEmail,
      issuedAt: block.issuedAt,
      expiresAt: block.expiresAt,
      issuedBy: block.issuedBy,
      verificationCode: block.verificationCode,
      blockIndex: block.index,
    },
  });
});

// Log an action to the blockchain
router.post('/log', auth, (req, res) => {
  const { action, details } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });
  const prevHash = db.blockchainLogs.length > 0
    ? db.blockchainLogs[db.blockchainLogs.length - 1].hash
    : '0'.repeat(64);
  const blockData = {
    index: db.blockchainLogs.length + 1,
    type: 'log',
    userId: req.user.id,
    userName: req.user.name,
    action,
    details: details || '',
    timestamp: new Date().toISOString(),
    previousHash: prevHash,
    nonce: Math.floor(Math.random() * 1000000),
  };
  const hash = createHash(blockData);
  const block = { ...blockData, id: generateId(), hash };
  db.blockchainLogs.push(block);
  res.status(201).json({ success: true, block });
});

// Get blockchain logs
router.get('/logs', auth, (req, res) => {
  const { type, limit } = req.query;
  let logs = req.user.role === 'admin' ? db.blockchainLogs : db.blockchainLogs.filter((b) => b.userId === req.user.id);

  if (type) logs = logs.filter(b => b.type === type);

  const maxLogs = parseInt(limit) || 100;
  logs = logs.slice(-maxLogs).reverse();

  res.json({
    logs,
    chainLength: db.blockchainLogs.length,
    merkleRoot: createMerkleRoot(db.blockchainLogs),
  });
});

// Verify blockchain integrity
router.get('/verify', auth, (req, res) => {
  let valid = true;
  let brokenAt = null;
  for (let i = 1; i < db.blockchainLogs.length; i++) {
    if (db.blockchainLogs[i].previousHash !== db.blockchainLogs[i - 1].hash) {
      valid = false;
      brokenAt = i;
      break;
    }
  }
  res.json({
    valid,
    blocksChecked: db.blockchainLogs.length,
    merkleRoot: createMerkleRoot(db.blockchainLogs),
    brokenAt,
    lastBlockHash: db.blockchainLogs.length > 0 ? db.blockchainLogs[db.blockchainLogs.length - 1].hash : null,
  });
});

module.exports = router;
