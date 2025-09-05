const mongoose = require('mongoose');

const AccountItemSchema = new mongoose.Schema({
  id: { type: String },
  accountNumber: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  source: { type: String, enum: ['asset', 'manual', 'predefined'], default: 'manual' },
  linkedAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  note: { type: String, default: '' },
}, { _id: false });

const SectionSchema = new mongoose.Schema({
  id: { type: String },
  key: {
    type: String,
    enum: [
      'assets_current',
      'assets_noncurrent',
      'liabilities_current',
      'liabilities_noncurrent',
      'equity',
      'revenue',
      'expenses',
      'custom'
    ],
    default: 'custom'
  },
  title: { type: String, required: true, trim: true },
  items: { type: [AccountItemSchema], default: [] },
}, { _id: false });

const ChartOfAccountsSchema = new mongoose.Schema({
  title: { type: String, default: 'Chart of Accounts' },
  headerTitle: { type: String, default: '' },

  branchName: { type: String, required: true, index: true },
  branchCode: { type: String, default: '', index: true },
  currency: { type: String, enum: ['USD', 'LRD'], default: 'LRD' },

  sections: { type: [SectionSchema], default: [] },

  notes: { type: String, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ChartOfAccounts', ChartOfAccountsSchema);
