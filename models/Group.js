const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  groupName: {
    type: String,
    required: true,
    trim: true
  },
  groupCode: {
    type: String,
    required: true,
    unique: true
  },
  branchName: {
    type: String,
    required: true
  },
  clients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  }],
  leader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  loanOfficer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  meetingDay: {
    type: String
  },
  meetingTime: {
    type: String
  },
  // Group leadership information
  presidentName: {
    type: String,
    trim: true
  },
  presidentNumber: {
    type: String,
    trim: true
  },
  securityName: {
    type: String,
    trim: true
  },
  securityNumber: {
    type: String,
    trim: true
  },
  treasurerName: {
    type: String,
    trim: true
  },
  treasurerNumber: {
    type: String,
    trim: true
  },
  police1Name: {
    type: String,
    trim: true
  },
  police1Number: {
    type: String,
    trim: true
  },
  police2Name: {
    type: String,
    trim: true
  },
  police2Number: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending'],
    default: 'Pending'
  },
  // Cumulative tally of all loans disbursed to members of this group
  groupTotalLoanAmount: {
    type: Number,
    default: 0
  },
  totalLoans: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster lookups by branch
groupSchema.index({ branchName: 1 });

groupSchema.virtual('memberCount').get(function() {
  return this.clients ? this.clients.length : 0;
});

module.exports = mongoose.model('Group', groupSchema);
