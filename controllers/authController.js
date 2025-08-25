const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const BranchRegistry = require('../models/BranchRegistry');
const FinancialSnapshot = require('../models/FinancialSnapshot');
const { dayBounds, toDateKey } = require('../services/snapshotService');

// User registration
exports.register = async (req, res) => {
  const { username, email, password, role, branch, branchCode } = req.body;

  try {
    // Check if user already exists in the same branch
    let user = await User.findOne({ email, branchCode });
    if (user) {
      return res.status(400).json({ message: 'User with this email already exists in this branch' });
    }
    const existingByUsername = await User.findOne({ username, branchCode });
    if (existingByUsername) {
      return res.status(400).json({ message: 'Username already exists in this branch' });
    }

    // Create new user
    user = new User({
      username,
      email,
      password,
      role,
      branch,
      branchCode
    });

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    // Ensure a per-branch stable FinancialSnapshot exists and is mapped
    try {
      let reg = await BranchRegistry.findOne({ branchCode });
      if (!reg) {
        const { start, end, key } = dayBounds(new Date());
        const initSnap = await FinancialSnapshot.create({
          branchName: branch,
          branchCode,
          currency: 'LRD',
          dateKey: key,
          periodStart: start,
          periodEnd: end,
          metrics: {},
          computedAt: new Date(),
        });
        try {
          reg = await BranchRegistry.create({ branchName: branch, branchCode, snapshotId: initSnap._id });
        } catch (e) {
          // Handle race: another process created it between checks
          if (e && e.code === 11000) {
            reg = await BranchRegistry.findOne({ branchCode });
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      console.error('[REGISTER] Branch snapshot bootstrap failed', e);
    }

    res.status(201).json({ message: 'User registered successfully' });

  } catch (error) {
    console.error('[AUTH REGISTER] error', error);
    if (error && error.code === 11000) {
      const keys = Object.keys(error.keyPattern || error.keyValue || {});
      if (keys.includes('email')) {
        return res.status(400).json({ message: 'User with this email already exists in this branch' });
      }
      if (keys.includes('username')) {
        return res.status(400).json({ message: 'Username already exists in this branch' });
      }
      return res.status(400).json({ message: 'Duplicate value for unique field', details: error.keyValue });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error', details: error.errors });
    }
    res.status(500).send('Server error');
  }
};

// User login


exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Return user info
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      branch: user.branch,
      branchCode: user.branchCode
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};
