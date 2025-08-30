const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  passBookNumber: { type: String, required: true, unique: true },
  branchName: { type: String, required: false },
  branchCode: { type: String, required: false },
  groupName: { type: String, required: true },
  groupCode: { type: String, required: true },
  memberName: { type: String, required: true },
  memberImage: { type: String }, // Base64 encoded image
  memberAge: { type: Number, required: true },
  guardianName: { type: String, required: true }, // Mother/Husband's Name
  memberNumber: { type: String, required: true },
  admissionDate: { type: Date, required: true },
  passBookIssuedDate: { type: Date, required: true },
  nationalId: { type: String, required: true },
  memberSignature: { type: String }, // Base64 encoded image
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  // Registrar info (who registered this client)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  createdByName: { type: String, required: false },
  createdByEmail: { type: String, required: false }
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);
