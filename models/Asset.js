const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  assetName: { type: String, required: true },
  assetType: { type: String, required: true },
  purchaseDate: { type: Date, required: true },
  purchasePrice: { type: Number, required: true },
  currentValue: { type: Number, required: true },
  currency: { type: String, required: true, enum: ['USD', 'LRD'], default: 'LRD' },
  branch: { type: String, required: true },
  description: { type: String },
  serialNumber: { type: String, unique: true, sparse: true } // Unique but can be null
}, { timestamps: true });

module.exports = mongoose.model('Asset', assetSchema);
