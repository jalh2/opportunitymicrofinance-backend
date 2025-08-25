const mongoose = require('mongoose');
const Distribution = require('../models/Distribution');
const Loan = require('../models/Loan');
const Group = require('../models/Group');
const Client = require('../models/Client');

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

    const loan = await Loan.findById(id).select('group currency status');
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
