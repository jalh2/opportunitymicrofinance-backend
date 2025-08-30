const mongoose = require('mongoose');

const signatorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    signature: { type: String }, // Base64
    cellphoneNumber: { type: String }
});

const loanCollectionSchema = new mongoose.Schema({
  memberName: { type: String, required: true },
  loanAmount: { type: Number, required: true },
  weeklyAmount: { type: Number, required: true },
  fieldCollection: { type: Number, required: true },
  advancePayment: { type: Number, default: 0 },
  fieldBalance: { type: Number, required: true },
  currency: { type: String, required: true, enum: ['USD', 'LRD'] },
  collectionDate: { type: Date, default: Date.now },
  // Optional breakdowns for accurate reporting (backward compatible)
  principalPortion: { type: Number, default: undefined },
  interestPortion: { type: Number, default: undefined },
  feesPortion: { type: Number, default: undefined },
  securityDepositContribution: { type: Number, default: undefined }
});

const loanSchema = new mongoose.Schema({
  // Client and Group Info

  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  clients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }],
  branchName: { type: String, required: true },
  branchCode: { type: String, required: true },
  
  // Promissory Note Fields
  meetingTime: { type: String },
  meetingDay: { type: String },
  memberCode: { type: String },
  memberAddress: { type: String },
  guarantorName: { type: String, required: true },
  guarantorRelationship: { type: String, required: true },
  loanAmountInWords: { type: String, required: true },
  loanDurationNumber: { type: Number, required: true },
  loanDurationUnit: { type: String, required: true, enum: ['days', 'weeks', 'months', 'years'], default: 'weeks' },
  purposeOfLoan: { type: String },
  businessType: { type: String },
  disbursementDate: { type: Date, default: Date.now },
  endingDate: { type: Date },
  previousLoanInfo: { type: String },
  memberOccupation: { type: String },
  weeklyInstallment: { type: Number },
  securityDeposit: { type: Number },
  memberAdmissionFee: { type: Number },
  rentingOrOwner: { type: String, enum: ['renting', 'owner'] },
  educationBackground: { type: String, enum: ['high school degree', 'vocational school', 'university degree'] },
  district: { type: String },
  maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'] },
  dependents: { type: Number },
  previousLoanSource: { type: String }, // Yes/No + details

  // Loan Details
  loanAmount: { type: Number, required: true },
  interestRate: { type: Number, required: true },
  currency: { type: String, required: true, enum: ['USD', 'LRD'], default: 'LRD' },
  status: { type: String, enum: ['pending', 'active', 'paid', 'defaulted'], default: 'pending' },

  // Collection Fields
  loanOfficerName: { type: String, required: true },
  totalRealization: { type: Number },
  collections: [loanCollectionSchema],

  // Signatories
  guarantorInfo: signatorySchema,
  treasuryInfo: signatorySchema,
  secretaryInfo: signatorySchema,
  groupHeadInfo: signatorySchema,
  loanOfficerInfo: signatorySchema,
  branchManagerInfo: signatorySchema,

}, { timestamps: true });

// Helpful indexes for reporting
loanCollectionSchema.index({ collectionDate: -1 });
loanCollectionSchema.index({ currency: 1, collectionDate: -1 });
loanSchema.index({ branchCode: 1, status: 1, endingDate: -1 });
loanSchema.index({ branchCode: 1, disbursementDate: -1 });
// Optimizations for monthly audit & shortage lookups
loanSchema.index({ group: 1, disbursementDate: -1 });
loanSchema.index({ group: 1, loanOfficerName: 1 });
loanSchema.index({ branchName: 1, disbursementDate: -1 });

module.exports = mongoose.model('Loan', loanSchema);
