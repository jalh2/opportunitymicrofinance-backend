const mongoose = require('mongoose');
const Distribution = require('../models/Distribution');
const Loan = require('../models/Loan');
const Group = require('../models/Group');
const Client = require('../models/Client');
const metricService = require('../services/metricService');

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

    const loan = await Loan.findById(id).select('group currency status branchName branchCode client loanOfficerName collectionStartDate');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    if (loan.status !== 'active') {
      return res.status(400).json({ message: 'Cannot record distribution for a loan that is not active' });
    }

    const groupId = loan.group;
    const currency = loan.currency;
    // Resolve borrower (client) for this loan if present
    let borrower = null;
    try {
      if (loan.client) {
        borrower = await Client.findById(loan.client).select('memberName');
      }
    } catch (_) { borrower = null; }

    // Parse optional flags for setting collection start date
    const body = req.body || {};
    const setStartFlag = body && (body.setCollectionStartDate === true || body.setCollectionStartDate === 'true' || body.setCollectionStartDate === 1 || body.setCollectionStartDate === '1');

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
      // Per new policy: if the loan has a borrower, all distributions must go to that borrower only
      let memberId = undefined;
      let memberName = undefined;
      if (loan.client) {
        memberId = loan.client;
        memberName = (borrower && borrower.memberName) ? borrower.memberName : (entry.memberName || '');
      } else {
        memberId = (entry.member && mongoose.Types.ObjectId.isValid(entry.member)) ? entry.member : undefined;
        memberName = entry.memberName || (entry.memberName === '' ? '' : undefined);
      }
      return {
        loan: id,
        group: groupId,
        member: memberId,
        memberName,
        amount,
        currency: payloadCurrency,
        date: entry.date ? new Date(entry.date) : new Date(),
        notes: entry.notes || '',
      };
    };

    const { entries } = body;
    let created;

    if (Array.isArray(entries) && entries.length > 0) {
      const docs = entries.map(normalize);
      created = await Distribution.insertMany(docs);
    } else {
      const payload = normalize(body || {});
      created = await Distribution.create(payload);
    }

    // Optionally set/override collectionStartDate on the loan
    if (setStartFlag) {
      try {
        // Determine the start date: explicit body.collectionStartDate, earliest of entries[].date, or body.date
        let startDate = null;
        if (body.collectionStartDate) {
          startDate = new Date(body.collectionStartDate);
        } else if (Array.isArray(entries) && entries.length > 0) {
          const dates = entries
            .map(e => (e && e.date) ? new Date(e.date) : null)
            .filter(Boolean);
          if (dates.length > 0) {
            startDate = new Date(Math.min.apply(null, dates.map(d => d.getTime())));
          }
        } else if (body.date) {
          startDate = new Date(body.date);
        }
        if (startDate && !isNaN(startDate.getTime())) {
          await Loan.findByIdAndUpdate(id, { collectionStartDate: startDate }, { new: false });
        }
      } catch (e) {
        console.error('[DISTRIBUTIONS] failed to set collectionStartDate', e);
        // continue without failing the request
      }
    }

    // Record metrics: increment waiting-to-be-collected by the distributed principal amount(s)
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
        await metricService.incrementMetrics({
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
          // rich context
          loan: loan._id || null,
          client: loan.client || null,
          loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
          updateSource: 'distribution',
        });
      }
    } catch (e) {
      // Non-fatal: log and continue
      console.error('[DISTRIBUTIONS] metrics increment failed', e);
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

// GET /api/loans/group/:id/distributions/summary
// Returns a map of loanId -> { complete, covered, total }
// complete: whether distribution coverage is complete for the loan
//  - per-client loans: complete if there is at least one distribution record
//  - legacy group loans: complete if all current group members have a distribution entry
exports.getDistributionSummaryByGroup = async (req, res) => {
  try {
    const { id } = req.params; // group id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    // Load group members (for legacy group-loan coverage checks)
    const group = await Group.findById(id)
      .select('clients')
      .populate('clients', 'memberName');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    const membersArr = Array.isArray(group.clients) ? group.clients : [];
    const memberIds = new Set(membersArr.map(m => String(m._id)));
    const memberNames = new Set(
      membersArr.map(m => String((m.memberName || '').trim()).toLowerCase()).filter(Boolean)
    );

    // Find loans in the group
    const loans = await Loan.find({ group: id }).select('_id client clients');
    const loanIds = loans.map(l => String(l._id));
    if (loanIds.length === 0) {
      return res.json({});
    }

    // Fetch all distributions for these loans in one query
    const distributions = await Distribution.find({ loan: { $in: loanIds } })
      .select('loan member memberName')
      .lean();

    // Group distributions by loan
    const byLoan = new Map();
    for (const d of distributions) {
      const key = String(d.loan);
      if (!byLoan.has(key)) byLoan.set(key, []);
      byLoan.get(key).push(d);
    }

    // Build summary
    const summary = {};
    for (const loan of loans) {
      const lid = String(loan._id);
      const arr = byLoan.get(lid) || [];
      if (loan.client) {
        // Per-client loan: at least one distribution indicates complete
        const complete = arr.length > 0;
        summary[lid] = { complete, covered: complete ? 1 : 0, total: 1 };
      } else {
        // Legacy group loan: compute coverage against current group members
        const coveredSet = new Set();
        for (const d of arr) {
          if (d.member) {
            const mid = String(d.member);
            if (memberIds.has(mid)) coveredSet.add(mid);
          } else if (d.memberName) {
            const n = String(d.memberName).trim().toLowerCase();
            if (memberNames.has(n)) coveredSet.add(n);
          }
        }
        const total = membersArr.length;
        const covered = coveredSet.size;
        const complete = total > 0 ? covered >= total : false;
        summary[lid] = { complete, covered, total };
      }
    }

    return res.json(summary);
  } catch (error) {
    console.error('[DISTRIBUTIONS] getDistributionSummaryByGroup error', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};
