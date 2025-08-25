const mongoose = require('mongoose');

const savingsTransactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    savingAmount: { type: Number, default: 0 },
    withdrawalAmount: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    currency: { type: String, required: true, enum: ['USD', 'LRD'] },
    // Type allows categorization of deposits
    type: { type: String, enum: ['personal', 'security', 'other'], default: 'personal' },
    tellerSignature: { type: String }, // Base64
    managerSignature: { type: String } // Base64
});

const savingsAccountSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, unique: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    loanCycle: { type: Number, default: 1 },
    currentBalance: { type: Number, default: 0 },
    currency: { type: String, required: true, enum: ['USD', 'LRD'], default: 'LRD' },
    transactions: [savingsTransactionSchema]
}, { timestamps: true });

// Index nested transaction dates for reporting
savingsAccountSchema.index({ 'transactions.date': -1 });

module.exports = mongoose.model('SavingsAccount', savingsAccountSchema);
