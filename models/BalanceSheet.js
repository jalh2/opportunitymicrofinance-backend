const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: String },
  label: { type: String, required: true, trim: true },
  amount: { type: Number, default: 0 },
  note: { type: String, default: '' },
}, { _id: false });

const SectionSchema = new mongoose.Schema({
  id: { type: String },
  // Known keys help compute standard rows
  key: {
    type: String,
    enum: [
      'assets_current',
      'assets_noncurrent',
      'liabilities_current',
      'liabilities_noncurrent',
      'equity',
      'custom'
    ],
    default: 'custom'
  },
  title: { type: String, required: true, trim: true },
  items: { type: [ItemSchema], default: [] },
}, { _id: false });

const ComputedRowSchema = new mongoose.Schema({
  auto: { type: Boolean, default: true },
  amount: { type: Number, default: 0 },
}, { _id: false });

const BalanceSheetSchema = new mongoose.Schema({
  title: { type: String, default: 'Balance Sheet' },
  headerTitle: { type: String, default: '' },

  branchName: { type: String, required: true, index: true },
  branchCode: { type: String, default: '', index: true },
  currency: { type: String, enum: ['USD', 'LRD'], required: true },

  periodStart: { type: Date, required: true, index: true },
  periodEnd: { type: Date, required: true, index: true },

  sections: { type: [SectionSchema], default: [] },

  computedRows: {
    totalAssets: { type: ComputedRowSchema, default: () => ({ auto: true, amount: 0 }) },
    totalLiabilities: { type: ComputedRowSchema, default: () => ({ auto: true, amount: 0 }) },
    totalEquity: { type: ComputedRowSchema, default: () => ({ auto: true, amount: 0 }) },
    totalLiabilitiesAndEquity: { type: ComputedRowSchema, default: () => ({ auto: true, amount: 0 }) },
    imbalance: { type: ComputedRowSchema, default: () => ({ auto: true, amount: 0 }) },
  },

  notes: { type: String, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('BalanceSheet', BalanceSheetSchema);
