const mongoose = require('mongoose');
const Distribution = require('../models/Distribution');
const Loan = require('../models/Loan');
const Group = require('../models/Group');
const Client = require('../models/Client');
const snapshotService = require('../services/snapshotService');

// GET /api/loans/:id/distributions
exports.getDistributionsByLoan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const loan = await Loan.findById(id).select('_id');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const distributions = await Distribution.find({ loan: id })
      .populate('member', 'memberName')
      .sort({ date: -1, createdAt: -1 });

    return res.json(distributions);
  } catch (error) {
    console.error('[DISTRIBUTIONS] getDistributionsByLoan error', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// POST /api/loans/:id/distributions
// Accepts either a single record (memberName/amount/date/notes) or { entries: [...] }
exports.createDistribution = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const loan = await Loan.findById(id).select('group currency status branchName branchCode');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    if (loan.status !== 'active') {
      return res.status(400).json({ message: 'Cannot record distribution for a loan that is not active' });
    }

    const groupId = loan.group;
    const currency = loan.currency;

    const normalize = (entry) => {
      const amount = Number(entry.amount || 0);
      if (!entry.memberName && !entry.member) {
        throw new Error('memberName or member is required');
      }
      if (!(amount > 0)) {
        throw new Error('amount must be greater than 0');
      }
      // Enforce currency consistency with the loan
      const payloadCurrency = entry.currency ? String(entry.currency) : currency;
      if (payloadCurrency !== currency) {
        throw new Error(`Distribution currency ${payloadCurrency} does not match loan currency ${currency}`);
      }
      return {
        loan: id,
        group: groupId,
        member: entry.member && mongoose.Types.ObjectId.isValid(entry.member) ? entry.member : undefined,
        memberName: entry.memberName || (entry.memberName === '' ? '' : undefined),
        amount,
        currency: payloadCurrency,
        date: entry.date ? new Date(entry.date) : new Date(),
        notes: entry.notes || '',
      };
    };

    const { entries } = req.body || {};
    let created;

    if (Array.isArray(entries) && entries.length > 0) {
      const docs = entries.map(normalize);
      created = await Distribution.insertMany(docs);
    } else {
      const payload = normalize(req.body || {});
      created = await Distribution.create(payload);
    }

    // Update financial snapshot: increment waiting-to-be-collected by the distributed principal amount(s)
    try {
      const arr = Array.isArray(created) ? created : [created];
      const totalAmt = arr.reduce((s, d) => s + Number(d.amount || 0), 0);
      if (totalAmt > 0) {
        // Use the first entry date if available, otherwise now
        const date = (arr[0] && arr[0].date) ? new Date(arr[0].date) : new Date();
        // Fetch group name/code for audit context
        let grpName = '', grpCode = '';
        if (loan.group) {
          try {
            const grpDoc = await Group.findById(loan.group).select('groupName groupCode');
            if (grpDoc) {
              grpName = grpDoc.groupName || '';
              grpCode = grpDoc.groupCode || '';
            }
          } catch (_) {}
        }
        await snapshotService.incrementMetrics({
          branchName: loan.branchName || '',
          branchCode: loan.branchCode || '',
          currency: loan.currency,
          date,
          inc: { totalWaitingToBeCollected: totalAmt },
          // audit/context
          group: loan.group || null,
          groupName: grpName,
          groupCode: grpCode,
          updatedBy: (req.user && req.user.id) || null,
          updatedByName: (req.user && req.user.username) || '',
          updatedByEmail: (req.user && req.user.email) || '',
          updateSource: 'distribution',
        });
      }
    } catch (e) {
      // Non-fatal: log and continue
      console.error('[DISTRIBUTIONS] snapshot increment failed', e);
    }

    // Return refreshed list for the loan
    const distributions = await Distribution.find({ loan: id })
      .populate('member', 'memberName')
      .sort({ date: -1, createdAt: -1 });

    return res.status(201).json(distributions);
  } catch (error) {
    console.error('[DISTRIBUTIONS] createDistribution error', error);
    res.status(400).json({ message: error.message || 'Failed to create distribution' });
  }
};
