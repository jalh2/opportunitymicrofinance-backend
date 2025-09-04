const mongoose = require('mongoose');

const branchDataSchema = new mongoose.Schema({
  // Branch and location information
  branchName: { type: String, required: true },
  branchCode: { type: String, required: true, unique: true },

  // Currency
  currency: { type: String, enum: ['USD', 'LRD'], required: true, default: 'LRD' },

  // Manually entered financial figures
  goodsCollectedBank: { type: Number, default: 0 },
  goodsCollectedOffice: { type: Number, default: 0 },
  finalOfficeBalance: { type: Number, default: 0 },

  // Manual metrics for FinancialSnapshot adjustments
  loanOfficerShortage: { type: Number, default: 0 },
  branchShortage: { type: Number, default: 0 },
  entityShortage: { type: Number, default: 0 },
  badDebt: { type: Number, default: 0 },

  // The business date for which these values apply
  dataDate: { type: Date, default: Date.now },

  // Last approved/applied values snapshot for idempotent FinancialSnapshot updates
  appliedMetrics: {
    date: { type: Date },
    currency: { type: String, enum: ['USD', 'LRD'] },
    loanOfficerShortage: { type: Number, default: 0 },
    branchShortage: { type: Number, default: 0 },
    entityShortage: { type: Number, default: 0 },
    badDebt: { type: Number, default: 0 },
    appliedAt: { type: Date },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  // Authorization and approval
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Indexes for query performance
branchDataSchema.index({ branchCode: 1, dataDate: -1 });
branchDataSchema.index({ status: 1 });
branchDataSchema.index({ currency: 1 });

module.exports = mongoose.model('BranchData', branchDataSchema);

