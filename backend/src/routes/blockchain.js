const express = require('express');
const crypto = require('crypto');
const BlockchainLog = require('../models/BlockchainLog');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

function createHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function getLastHash() {
  const last = await BlockchainLog.findOne().sort({ index: -1 }).lean();
  return last ? last.hash : '0'.repeat(64);
}

async function getNextIndex() {
  const count = await BlockchainLog.countDocuments();
  return count + 1;
}

function generateTouristIdNumber(count) {
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(6, '0');
  return 'WM-IN-' + year + '-' + seq;
}

// Digital Tourist ID
router.post('/digital-id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if already issued
    const existing = await BlockchainLog.findOne({ userId: req.user.id, type: 'digital_id' }).lean();
    if (existing) return res.json({ digitalId: { ...existing, id: existing._id.toString() }, alreadyExists: true });

    const prevHash = await getLastHash();
    const index = await getNextIndex();
    const idCount = await BlockchainLog.countDocuments({ type: 'digital_id' });
    const touristIdNumber = generateTouristIdNumber(idCount);

    const blockData = {
      index, type: 'digital_id',
      userId: user._id.toString(), userName: user.name, userEmail: user.email,
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
    const verificationCode = hash.substring(0, 8).toUpperCase() + '-' + hash.substring(8, 16).toUpperCase();

    const block = await BlockchainLog.create({
      ...blockData,
      userId: user._id,
      hash, verificationCode, verified: true,
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('blockchain:new_id', {
        userName: user.name, touristIdNumber, issuedAt: block.issuedAt,
      });
    }

    res.status(201).json({ digitalId: { ...block.toObject(), id: block._id.toString() } });
  } catch (err) {
    console.error('Digital ID error:', err);
    res.status(500).json({ error: 'Failed to create digital ID' });
  }
});

// Verify a digital ID
router.get('/verify-id/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const block = await BlockchainLog.findOne({
      type: 'digital_id',
      $or: [{ verificationCode: code }, { hash: code }, { touristIdNumber: code }],
    }).lean();

    if (!block) return res.status(404).json({ valid: false, error: 'Digital ID not found' });

    const expired = new Date(block.expiresAt) < new Date();

    res.json({
      valid: !expired,
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
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Log an action
router.post('/log', auth, async (req, res) => {
  try {
    const { action, details } = req.body;
    if (!action) return res.status(400).json({ error: 'action required' });
    const prevHash = await getLastHash();
    const index = await getNextIndex();

    const blockData = {
      index, type: 'log',
      userId: req.user.id, userName: req.user.name,
      action, details: details || '',
      timestamp: new Date(), previousHash: prevHash,
      nonce: Math.floor(Math.random() * 1000000),
    };
    const hash = createHash(blockData);
    const block = await BlockchainLog.create({ ...blockData, hash });
    res.status(201).json({ success: true, block: { ...block.toObject(), id: block._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log action' });
  }
});

// Get logs
router.get('/logs', auth, async (req, res) => {
  try {
    const { type, limit } = req.query;
    const filter = req.user.role === 'admin' ? {} : { userId: req.user.id };
    if (type) filter.type = type;
    const maxLogs = parseInt(limit) || 100;
    const logs = await BlockchainLog.find(filter).sort({ index: -1 }).limit(maxLogs).lean();
    const mapped = logs.map(l => ({ ...l, id: l._id.toString() }));
    const chainLength = await BlockchainLog.countDocuments();
    res.json({ logs: mapped, chainLength });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Verify chain integrity
router.get('/verify', auth, async (req, res) => {
  try {
    const allBlocks = await BlockchainLog.find().sort({ index: 1 }).lean();
    let valid = true;
    let brokenAt = null;
    for (let i = 1; i < allBlocks.length; i++) {
      if (allBlocks[i].previousHash !== allBlocks[i - 1].hash) {
        valid = false;
        brokenAt = i;
        break;
      }
    }
    res.json({
      valid, blocksChecked: allBlocks.length, brokenAt,
      lastBlockHash: allBlocks.length > 0 ? allBlocks[allBlocks.length - 1].hash : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
