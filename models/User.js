const mongoose = require('mongoose');
const { roles } = require('../config/roles');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: roles,
    default: 'staff'
  },
  branch: {
    type: String,
    required: true,
    trim: true
  },
  branchCode: {
    type: String,
    required: true,
    trim: true
  }
}, { timestamps: true });

// Enforce uniqueness per branch
userSchema.index({ branchCode: 1, email: 1 }, { unique: true });
userSchema.index({ branchCode: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
