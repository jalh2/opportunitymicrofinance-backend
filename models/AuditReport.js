const mongoose = require('mongoose');

const auditReportSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  branchName: {
    type: String,
    required: true
  },
  branchLoan: {
    type: String,
    required: true
  },
  loanOfficerName: {
    type: String,
    required: true
  },
  groups: [{
    groupName: {
      type: String,
      required: true
    },
    loanLedger: {
      type: Number,
      required: true,
      default: 0
    },
    fieldCollection: {
      type: Number,
      required: true,
      default: 0
    },
    ledgerBalance: {
      type: Number,
      required: true,
      default: 0
    },
    fieldBalance: {
      type: Number,
      required: true,
      default: 0
    },
    shortage: {
      type: Number,
      default: 0
    },
    overage: {
      type: Number,
      default: 0
    },
    overdue: {
      type: Number,
      default: 0
    }
  }],
  auditorName: {
    type: String,
    required: true
  },
  approvedBy: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditReport', auditReportSchema);
