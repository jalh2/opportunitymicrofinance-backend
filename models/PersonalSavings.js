const mongoose = require('mongoose');

const personalSavingsTransactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  savingAmount: { type: Number, default: 0 },
  withdrawalAmount: { type: Number, default: 0 },
  balance: { type: Number, required: true },
  currency: { type: String, required: true, enum: ['USD', 'LRD'] },
  tellerSignature: { type: String }, // Base64
  managerSignature: { type: String }, // Base64
}, { _id: true });

const personalSavingsAccountSchema = new mongoose.Schema({
  // One personal savings account per client (individual)
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, unique: true },
  // Optional context to the client's group
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  currentBalance: { type: Number, default: 0 },
  currency: { type: String, required: true, enum: ['USD', 'LRD'], default: 'LRD' },
  transactions: [personalSavingsTransactionSchema],
}, { timestamps: true });

personalSavingsAccountSchema.index({ 'transactions.date': -1 });

module.exports = mongoose.model('PersonalSavingsAccount', personalSavingsAccountSchema);
