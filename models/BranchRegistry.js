const mongoose = require('mongoose');

const branchRegistrySchema = new mongoose.Schema({
  branchName: { type: String, required: true, trim: true },
  branchCode: { type: String, required: true, trim: true },
  snapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialSnapshot', required: true },
}, { timestamps: true });

branchRegistrySchema.index({ branchCode: 1 }, { unique: true });
branchRegistrySchema.index({ branchName: 1 }, { unique: false });

module.exports = mongoose.model('BranchRegistry', branchRegistrySchema);
