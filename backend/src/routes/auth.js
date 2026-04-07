const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const {
      name, email, password, phone, role,
      nationality, passportNumber, dateOfBirth, gender,
      emergencyContactName, emergencyContactPhone, emergencyContactRelation,
      address, bloodGroup, medicalConditions, preferredLanguage, travelPurpose,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: phone || '',
      role: role === 'admin' ? 'admin' : 'tourist',
      nationality: nationality || '',
      passportNumber: passportNumber || '',
      dateOfBirth: dateOfBirth || '',
      gender: gender || '',
      emergencyContactName: emergencyContactName || '',
      emergencyContactPhone: emergencyContactPhone || '',
      emergencyContactRelation: emergencyContactRelation || '',
      address: address || '',
      bloodGroup: bloodGroup || '',
      medicalConditions: medicalConditions || '',
      preferredLanguage: preferredLanguage || 'English',
      travelPurpose: travelPurpose || '',
    });

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET, { expiresIn: '7d' }
    );
    res.status(201).json({ user: user.toSafeJSON(), token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });
    user.isOnline = true;
    await user.save();
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ user: user.toSafeJSON(), token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Profile update route
router.put('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const allowedFields = [
      'name', 'phone', 'nationality', 'passportNumber', 'dateOfBirth', 'gender',
      'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
      'address', 'bloodGroup', 'medicalConditions', 'preferredLanguage', 'travelPurpose',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    }

    // Check if profile is reasonably complete
    user.profileCompleted = !!(user.name && user.phone && user.nationality && user.emergencyContactPhone);

    await user.save();
    res.json({ user: user.toSafeJSON(), message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Change password route
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

// Admin: list all users
router.get('/users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const users = await User.find({}).select('-password').lean();
    const safeUsers = users.map(u => ({ ...u, id: u._id.toString() }));
    res.json({ users: safeUsers });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
