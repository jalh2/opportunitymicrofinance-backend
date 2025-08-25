const mongoose = require('mongoose');

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
    enum: ['admin','manager','branch head','staff','field agent','loan officer'],
    default: 'staff'
  },
  branch: {
    type: String,
    required: true
  },
  branchCode: {
    type: String,
    required: true
  }
}, { timestamps: true });

// Enforce uniqueness per branch
userSchema.index({ branchCode: 1, email: 1 }, { unique: true });
userSchema.index({ branchCode: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
