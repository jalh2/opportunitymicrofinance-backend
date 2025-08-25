const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // key, e.g., 'passbook' or per-scope keys
    seq: { type: Number, default: 0 },
  },
  { collection: 'counters' }
);

module.exports = mongoose.model('Counter', counterSchema);
