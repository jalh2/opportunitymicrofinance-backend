const mongoose = require('mongoose');

const bankDepositTransactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  depositAmount: { type: Number, default: 0 },
  withdrawalAmount: { type: Number, default: 0 },
  balance: { type: Number, required: true },
  currency: { type: String, required: true, enum: ['USD', 'LRD'] },
  tellerSignature: { type: String }, // Base64
  managerSignature: { type: String }, // Base64
  note: { type: String },
}, { _id: true });

const bankDepositAccountSchema = new mongoose.Schema({
  branchName: { type: String, required: true, trim: true },
  branchCode: { type: String, required: true, trim: true },
  currentBalance: { type: Number, default: 0 },
  currency: { type: String, required: true, enum: ['USD', 'LRD'], default: 'LRD' },
  transactions: [bankDepositTransactionSchema],
}, { timestamps: true });

bankDepositAccountSchema.index({ branchCode: 1, currency: 1 }, { unique: true });
bankDepositAccountSchema.index({ 'transactions.date': -1 });

module.exports = mongoose.model('BankDepositAccount', bankDepositAccountSchema);
