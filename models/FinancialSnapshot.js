const mongoose = require('mongoose');

const metricsSchema = new mongoose.Schema({
  totalProfit: { type: Number, default: 0 },
  totalAdmissionFees: { type: Number, default: 0 },
  totalSavingsDeposits: { type: Number, default: 0 },
  totalSavingsWithdrawals: { type: Number, default: 0 },
  netSavingsFlow: { type: Number, default: 0 },
  totalSecurityDepositsFlow: { type: Number, default: 0 },
  totalPersonalSavingsFlow: { type: Number, default: 0 },
  totalInterestCollected: { type: Number, default: 0 },
  totalFeesCollected: { type: Number, default: 0 },
  // Total amount collected from loans (e.g., principal repayments)
  totalCollected: { type: Number, default: 0 },
  totalWaitingToBeCollected: { type: Number, default: 0 },
  totalOverdue: { type: Number, default: 0 },
  totalExpenses: { type: Number, default: 0 },
  totalSavingsBalance: { type: Number, default: 0 },
  totalPersonalSavingsBalance: { type: Number, default: 0 },
  totalSecuritySavingsBalance: { type: Number, default: 0 },
  totalLoansCount: { type: Number, default: 0 },
  // Total principal amount distributed (sum of disbursed loan amounts)
  totalLoanAmountDistributed: { type: Number, default: 0 },
  // New metrics
  totalAppraisalFees: { type: Number, default: 0 },
  totalPendingLoanAmount: { type: Number, default: 0 },
  // Shortage tracking (sum for the day; per-branch snapshot)
  loanOfficerShortage: { type: Number, default: 0 },
  branchShortage: { type: Number, default: 0 },
  entityShortage: { type: Number, default: 0 },
  // Bad debt (as-of): outstanding principal for defaulted loans
  badDebt: { type: Number, default: 0 },
}, { _id: false, timestamps: true });

const financialSnapshotSchema = new mongoose.Schema({
  branchName: { type: String, required: true },
  branchCode: { type: String },
  currency: { type: String, required: true, enum: ['USD', 'LRD'] },
  dateKey: { type: String, required: true }, // YYYY-MM-DD (UTC)
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  metrics: { type: metricsSchema, default: () => ({}) },
  computedAt: { type: Date, default: Date.now },
  // Optional audit/context fields to capture the most recent actor and scope
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  groupName: { type: String },
  groupCode: { type: String },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String },
  updatedByEmail: { type: String },
  updateSource: { type: String }, // e.g. 'savingsTransaction', 'loanCollection', 'distribution', 'expense', 'clientRegistration'
}, { timestamps: true });

financialSnapshotSchema.index({ branchCode: 1, dateKey: 1, currency: 1 });
financialSnapshotSchema.index({ branchName: 1, dateKey: 1, currency: 1 });
financialSnapshotSchema.index({ group: 1, dateKey: 1, currency: 1 });

module.exports = mongoose.model('FinancialSnapshot', financialSnapshotSchema);

