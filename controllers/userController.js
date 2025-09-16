const User = require('../models/User');
const bcrypt = require('bcrypt');
const BranchRegistry = require('../models/BranchRegistry');
const FinancialSnapshot = require('../models/FinancialSnapshot');
const { dayBounds } = require('../services/snapshotService');
const mongoose = require('mongoose');

// Get all branches
exports.getBranches = async (req, res) => {
  try {
    const branches = await User.distinct('branch');
    res.json(branches);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get all loan officers
exports.getLoanOfficers = async (req, res) => {
  try {
    const loanOfficers = await User.find({ role: 'loan officer' }).select('-password');
    res.json(loanOfficers);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Create user (admin-only)
exports.createUser = async (req, res) => {
  const { username, email, password, role, branch, branchCode } = req.body;

  if (!username || !email || !password || !branch || !branchCode) {
    return res.status(400).json({ message: 'username, email, password, branch, and branchCode are required' });
  }

  try {
    // Enforce uniqueness within the same branch only
    let existing = await User.findOne({ email, branchCode });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists in this branch' });
    }
    const existingByUsername = await User.findOne({ username, branchCode });
    if (existingByUsername) {
      return res.status(400).json({ message: 'Username already exists in this branch' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      email,
      password: hashed,
      role: role || 'staff',
      branch,
      branchCode,
    });

    // Ensure BranchRegistry has a mapping for this branch
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
          if (e && e.code === 11000) {
            reg = await BranchRegistry.findOne({ branchCode });
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      console.error('[ADMIN CREATE USER] Branch snapshot bootstrap failed', e);
    }

    const safeUser = user.toObject();
    delete safeUser.password;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error('[ADMIN CREATE USER] error', error);
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
    return res.status(500).send('Server error');
  }
};

// Change user password (admin-only)
exports.changePassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ message: 'newPassword is required' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error.message);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(500).send('Server error');
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error.message);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).send('Server error');
  }
};

// Update user
exports.updateUser = async (req, res) => {
  const { username, email, role, branch, branchCode } = req.body;

  // Build user object
  const userFields = {};
  if (username) userFields.username = username;
  if (email) userFields.email = email;
  if (role) userFields.role = role;
  if (branch) userFields.branch = branch;
  if (branchCode) userFields.branchCode = branchCode;

  try {
    // Basic sanitization for identity fields
    if (userFields.username && typeof userFields.username === 'string') {
      userFields.username = userFields.username.trim();
    }
    if (userFields.email && typeof userFields.email === 'string') {
      userFields.email = userFields.email.trim().toLowerCase();
    }

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: userFields },
      { new: true, runValidators: true, context: 'query' }
    ).select('-password');

    return res.json(user);
  } catch (error) {
    console.error('[UPDATE USER] error', error);
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
    if (error && (error.kind === 'ObjectId' || error.name === 'CastError')) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(500).send('Server error');
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    await User.findByIdAndDelete(id);
    return res.json({ message: 'User removed' });
  } catch (error) {
    console.error('[DELETE /api/users/:id] error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
