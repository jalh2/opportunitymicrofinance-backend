const mongoose = require('mongoose');

const savingsTransactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    savingAmount: { type: Number, default: 0 },
    withdrawalAmount: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    currency: { type: String, required: true, enum: ['USD', 'LRD'] },
    // Type allows categorization of deposits
    type: { type: String, enum: ['personal', 'security', 'other'], default: 'personal' },
    // Which client performed this transaction (deposit/withdrawal)
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    tellerSignature: { type: String }, // Base64
    managerSignature: { type: String } // Base64
});

const savingsAccountSchema = new mongoose.Schema({
    // Optional legacy client field (kept for backward compatibility)
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    // One savings account per group
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, unique: true },
    loanCycle: { type: Number, default: 1 },
    currentBalance: { type: Number, default: 0 },
    currency: { type: String, required: true, enum: ['USD', 'LRD'], default: 'LRD' },
    transactions: [savingsTransactionSchema]
}, { timestamps: true });

// Index nested transaction dates for reporting
savingsAccountSchema.index({ 'transactions.date': -1 });
// Ensure optional client field does not cause unique violations when null/absent
// We explicitly set a sparse, non-unique index on client. If your database already
// has a unique index named 'client_1', drop it or run syncIndexes to reconcile.
// Example (mongo shell): db.savingsaccounts.dropIndex('client_1')
savingsAccountSchema.index({ client: 1 }, { sparse: true, unique: false });

module.exports = mongoose.model('SavingsAccount', savingsAccountSchema);
