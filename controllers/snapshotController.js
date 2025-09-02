const mongoose = require('mongoose');
const FinancialSnapshot = require('../models/FinancialSnapshot');
const BranchRegistry = require('../models/BranchRegistry');
const FIXED_SNAPSHOT_ID = process.env.FIXED_SNAPSHOT_ID;
const Loan = require('../models/Loan');
const SavingsAccount = require('../models/Savings');
const Expense = require('../models/Expense');
const PersonalSavingsAccount = require('../models/PersonalSavings');
const Group = require('../models/Group');
const Client = require('../models/Client');

function toDateKey(d) {
  const iso = new Date(d).toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD
}

function dayBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return { start, end, key: toDateKey(start) };
}

async function resolveBranchNameFromCode(branchCode) {
  if (!branchCode) return '';
  // Try from loans first (most common)
  const loanHit = await Loan.findOne({ branchCode }).select('branchName').lean();
  if (loanHit && loanHit.branchName) return loanHit.branchName;
  // Fallback: expenses
  const expHit = await Expense.findOne({ branchCode }).select('branchName').lean();
  if (expHit && expHit.branchName) return expHit.branchName;
  return '';
}

// POST /api/snapshots/compute?branchName=&branchCode=&date=YYYY-MM-DD&currency=LRD|USD
exports.computeDailySnapshot = async (req, res) => {
  try {
    let { branchName, branchCode, date, currency = 'LRD' } = req.query;
    if (!branchName && !branchCode) {
      return res.status(400).json({ message: 'branchName or branchCode is required' });
    }
    if (!['USD', 'LRD'].includes(currency)) {
      return res.status(400).json({ message: 'currency must be USD or LRD' });
    }

    const { start, end, key } = dayBounds(date);

    // Resolve group scope by branchName (if available)
    let groupIds = [];
    if (!branchName && branchCode) {
      branchName = await resolveBranchNameFromCode(branchCode);
    }
    if (branchName) {
      const groups = await Group.find({ branchName }).select('_id');
      groupIds = groups.map(g => g._id);
    }

    // 1) Loan collections for the day (expected vs actual, interest, fees, security deposit contrib)
    const loanMatch = { currency };
    if (branchCode) loanMatch.branchCode = branchCode;
    if (branchName) loanMatch.branchName = branchName;

    const dailyCollectionsAgg = await Loan.aggregate([
      { $match: loanMatch },
      { $unwind: '$collections' },
      { $match: { 'collections.collectionDate': { $gte: start, $lte: end }, 'collections.currency': currency } },
      {
        $group: {
          _id: null,
          expected: { $sum: { $ifNull: ['$collections.weeklyAmount', 0] } },
          collected: { $sum: { $ifNull: ['$collections.fieldCollection', 0] } },
          interest: { $sum: { $ifNull: ['$collections.interestPortion', 0] } },
          fees: { $sum: { $ifNull: ['$collections.feesPortion', 0] } },
          principal: { $sum: { $ifNull: ['$collections.principalPortion', 0] } },
          securityContrib: { $sum: { $ifNull: ['$collections.securityDepositContribution', 0] } },
        }
      }
    ]);
    const dailyCol = dailyCollectionsAgg[0] || { expected: 0, collected: 0, interest: 0, fees: 0, principal: 0, securityContrib: 0 };
    const shortageToday = Math.max((dailyCol.expected || 0) - (dailyCol.collected || 0), 0);

    // 2) Admission fees from client registrations today (LRD only)
    let totalAdmissionFees = 0;
    if (currency === 'LRD') {
      const clientMatch = { admissionDate: { $gte: start, $lte: end } };
      if (branchCode) clientMatch.branchCode = branchCode;
      if (branchName) clientMatch.branchName = branchName;
      const clientAgg = await Client.aggregate([
        { $match: clientMatch },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]);
      const count = (clientAgg[0] && clientAgg[0].count) || 0;
      totalAdmissionFees = count * 1000; // fixed LRD 1,000 per client registration
    }

    // Loans disbursed today: count and total repayable (principal + interest)
    const loanDisbursedMatch = Object.assign({ disbursementDate: { $gte: start, $lte: end } }, loanMatch);
    const loanCountAgg = await Loan.aggregate([
      { $match: loanDisbursedMatch },
      { $group: { _id: null, totalLoansCount: { $sum: 1 } } }
    ]);
    const totalLoansCount = (loanCountAgg[0] && loanCountAgg[0].totalLoansCount) || 0;
    const loanRepayableAgg = await Loan.aggregate([
      { $match: loanDisbursedMatch },
      { $group: { _id: null, repayable:
        { $sum: { $multiply: [ { $ifNull: ['$loanAmount', 0] }, { $add: [1, { $divide: [ { $ifNull: ['$interestRate', 0] }, 100 ] }] } ] } }
      } }
    ]);
    const totalRepayableToday = (loanRepayableAgg[0] && loanRepayableAgg[0].repayable) || 0;

    // 3) Overdue as of end of day (simplified: outstanding amount for loans past endingDate)
    const overdueAgg = await Loan.aggregate([
      { $match: Object.assign({ currency, status: 'active', endingDate: { $lt: end } }, loanMatch) },
      { $addFields: { loanAmountSafe: { $ifNull: ['$loanAmount', 0] } } },
      { $unwind: { path: '$collections', preserveNullAndEmptyArrays: true } },
      { $match: { $or: [ { 'collections.collectionDate': { $lte: end } }, { collections: { $eq: null } } ] } },
      { $group: { _id: '$_id', loanAmount: { $first: '$loanAmountSafe' }, collectedToDate: { $sum: { $ifNull: ['$collections.fieldCollection', 0] } } } },
      { $project: { outstanding: { $max: [ { $subtract: ['$loanAmount', '$collectedToDate'] }, 0 ] } } },
      { $group: { _id: null, totalOverdue: { $sum: '$outstanding' } } }
    ]);
    const overdue = overdueAgg[0] || { totalOverdue: 0 };

    // 3b) Cumulative in-term arrears up to end of day (sum of shortfalls minus overpayments across collections)
    const arrearsToDateAgg = await Loan.aggregate([
      { $match: Object.assign({ status: 'active', endingDate: { $gte: end } }, loanMatch) },
      { $unwind: '$collections' },
      { $match: { 'collections.collectionDate': { $lte: end }, 'collections.currency': currency } },
      { $project: {
          delta: { $subtract: [
            { $ifNull: ['$collections.weeklyAmount', 0] },
            { $add: [ { $ifNull: ['$collections.fieldCollection', 0] }, { $ifNull: ['$collections.advancePayment', 0] } ] }
          ] }
        }
      },
      { $group: { _id: null, arrears: { $sum: '$delta' } } }
    ]);
    const arrearsToDate = (arrearsToDateAgg[0] && arrearsToDateAgg[0].arrears) || 0;

    // 4) Savings flows (by type) for the day (GROUP savings only)
    let savingsFlows = { personal: { dep: 0, wd: 0 }, security: { dep: 0, wd: 0 }, all: { dep: 0, wd: 0 } };
    let personalBalToDate = 0;
    let securityBalToDate = 0;
    let totalSavingsBalanceToDate = 0;

    // Personal Savings (INDIVIDUAL accounts) metrics
    let personalAccFlowDep = 0;
    let personalAccFlowWd = 0;
    let personalAccFlowNet = 0;
    let personalAccBalToDateSum = 0;

    if (groupIds.length > 0) {
      const flowsDayAgg = await SavingsAccount.aggregate([
        { $match: { group: { $in: groupIds }, currency } },
        { $unwind: '$transactions' },
        { $match: { 'transactions.date': { $gte: start, $lte: end }, 'transactions.currency': currency } },
        { $group: { _id: '$transactions.type', dep: { $sum: '$transactions.savingAmount' }, wd: { $sum: '$transactions.withdrawalAmount' } } }
      ]);
      for (const r of flowsDayAgg) {
        if (r._id === 'personal') savingsFlows.personal = { dep: r.dep || 0, wd: r.wd || 0 };
        if (r._id === 'security') savingsFlows.security = { dep: r.dep || 0, wd: r.wd || 0 };
        savingsFlows.all.dep += r.dep || 0; savingsFlows.all.wd += r.wd || 0;
      }

      // Balances by type up to end of day (derived from cumulative flows)
      const flowsToDate = await SavingsAccount.aggregate([
        { $match: { group: { $in: groupIds }, currency } },
        { $unwind: '$transactions' },
        { $match: { 'transactions.date': { $lte: end }, 'transactions.currency': currency } },
        { $group: { _id: '$transactions.type', dep: { $sum: '$transactions.savingAmount' }, wd: { $sum: '$transactions.withdrawalAmount' } } }
      ]);
      let personalDep = 0, personalWd = 0, securityDep = 0, securityWd = 0, otherDep = 0, otherWd = 0;
      for (const r of flowsToDate) {
        if (r._id === 'personal') { personalDep = r.dep || 0; personalWd = r.wd || 0; }
        else if (r._id === 'security') { securityDep = r.dep || 0; securityWd = r.wd || 0; }
        else { otherDep += r.dep || 0; otherWd += r.wd || 0; }
      }
      personalBalToDate = personalDep - personalWd;
      securityBalToDate = securityDep - securityWd;
      totalSavingsBalanceToDate = personalBalToDate + securityBalToDate + (otherDep - otherWd);
    }

    // 4b) Personal Savings Accounts (individual) - compute flows for the day and balance as-of end of day
    // Flows during the day (dep/wd)
    const personalAccFlowAgg = await PersonalSavingsAccount.aggregate([
      { $match: { currency } },
      { $lookup: { from: 'clients', localField: 'client', foreignField: '_id', as: 'clientDoc' } },
      { $unwind: '$clientDoc' },
      ...(branchCode ? [ { $match: { 'clientDoc.branchCode': branchCode } } ] : []),
      ...(branchName ? [ { $match: { 'clientDoc.branchName': branchName } } ] : []),
      { $unwind: '$transactions' },
      { $match: { 'transactions.date': { $gte: start, $lte: end }, 'transactions.currency': currency } },
      { $group: { _id: null, dep: { $sum: { $ifNull: ['$transactions.savingAmount', 0] } }, wd: { $sum: { $ifNull: ['$transactions.withdrawalAmount', 0] } } } }
    ]);
    if (personalAccFlowAgg[0]) {
      personalAccFlowDep = personalAccFlowAgg[0].dep || 0;
      personalAccFlowWd = personalAccFlowAgg[0].wd || 0;
      personalAccFlowNet = (personalAccFlowDep || 0) - (personalAccFlowWd || 0);
    }

    // Balance as-of end of day: sum currentBalance for accounts in scope
    const personalAccBalAgg = await PersonalSavingsAccount.aggregate([
      { $match: { currency } },
      { $lookup: { from: 'clients', localField: 'client', foreignField: '_id', as: 'clientDoc' } },
      { $unwind: '$clientDoc' },
      ...(branchCode ? [ { $match: { 'clientDoc.branchCode': branchCode } } ] : []),
      ...(branchName ? [ { $match: { 'clientDoc.branchName': branchName } } ] : []),
      { $group: { _id: null, bal: { $sum: { $ifNull: ['$currentBalance', 0] } } } }
    ]);
    if (personalAccBalAgg[0]) {
      personalAccBalToDateSum = personalAccBalAgg[0].bal || 0;
    }

    // 5) Expenses for the day
    const expenseMatch = { currency, expenseDate: { $gte: start, $lte: end } };
    if (branchCode) expenseMatch.branchCode = branchCode;
    if (branchName) expenseMatch.branchName = branchName;
    const expenseAgg = await Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpenses: { $sum: { $ifNull: ['$amount', 0] } } } }
    ]);
    const expenses = expenseAgg[0] || { totalExpenses: 0 };

    // Profit (simplified): interest + fees + admissionFees - expenses
    // Keep core (loan) fees separate to avoid double-counting when computing profit
    const coreFeesCollected = (dailyCol.fees || 0);
    const totalInterestCollected = (dailyCol.interest || 0);
    const totalAdmissionFeesVar = totalAdmissionFees;
    const totalFeesCollected = coreFeesCollected + (totalAdmissionFeesVar || 0); // include admission fees in total fees collected
    const totalExpenses = (expenses.totalExpenses || 0);
    const totalProfit = totalInterestCollected + coreFeesCollected + totalAdmissionFeesVar - totalExpenses;

    // Do not compute or overwrite totalWaitingToBeCollected here; this metric is now driven solely by distributions.
    const principalCollectedToday = (dailyCol.principal || 0);

    const metrics = {
      totalProfit,
      totalAdmissionFees: totalAdmissionFeesVar,
      totalSavingsDeposits: savingsFlows.all.dep,
      totalSavingsWithdrawals: savingsFlows.all.wd,
      netSavingsFlow: (savingsFlows.all.dep || 0) - (savingsFlows.all.wd || 0),
      totalSecurityDepositsFlow: (savingsFlows.security.dep || 0) - (savingsFlows.security.wd || 0),
      // Personal savings flow from PersonalSavings accounts only
      totalPersonalSavingsFlow: personalAccFlowNet,
      totalInterestCollected,
      totalFeesCollected,
      // totalWaitingToBeCollected is intentionally excluded from daily compute
      totalOverdue: (overdue.totalOverdue || 0) + arrearsToDate,
      totalExpenses,
      totalSavingsBalance: totalSavingsBalanceToDate,
      // Personal savings balance from PersonalSavings accounts only
      totalPersonalSavingsBalance: personalAccBalToDateSum,
      totalSecuritySavingsBalance: securityBalToDate,
      totalLoansCount: totalLoansCount || 0,
    };

    const payload = {
      branchName: branchName || '',
      branchCode: branchCode || '',
      currency,
      dateKey: key,
      periodStart: start,
      periodEnd: end,
      metrics,
      computedAt: new Date(),
    };

    const now = new Date();
    const update = {
      $set: Object.assign({}, payload, { 'metrics.updatedAt': now }),
      $setOnInsert: { 'metrics.createdAt': now }
    };

    // Prefer per-branch stable snapshotId from BranchRegistry
    let snapshotId = null;
    try {
      if (branchCode) {
        const reg = await BranchRegistry.findOne({ branchCode }).select('snapshotId').lean();
        snapshotId = reg && reg.snapshotId;
      }
      if (!snapshotId && branchName) {
        const regByName = await BranchRegistry.findOne({ branchName }).select('snapshotId').lean();
        snapshotId = regByName && regByName.snapshotId;
      }
    } catch (e) {
      console.error('[SNAPSHOT] BranchRegistry lookup failed in compute', e);
    }

    let snapshot;
    if (snapshotId && mongoose.Types.ObjectId.isValid(snapshotId)) {
      snapshot = await FinancialSnapshot.findOneAndUpdate(
        { _id: snapshotId },
        update,
        { new: true, upsert: true }
      );
    } else if (FIXED_SNAPSHOT_ID && mongoose.Types.ObjectId.isValid(FIXED_SNAPSHOT_ID)) {
      snapshot = await FinancialSnapshot.findOneAndUpdate(
        { _id: FIXED_SNAPSHOT_ID },
        update,
        { new: true, upsert: true }
      );
    } else {
      snapshot = await FinancialSnapshot.findOneAndUpdate(
        { branchCode: payload.branchCode, branchName: payload.branchName, currency, dateKey: key },
        update,
        { new: true, upsert: true }
      );
    }

    return res.status(201).json(snapshot);
  } catch (error) {
    console.error('[SNAPSHOT] computeDailySnapshot error', error);
    res.status(500).json({ message: error.message || 'Failed to compute snapshot' });
  }
};

// GET /api/snapshots?branchName=&branchCode=&startDate=&endDate=&currency=
exports.getSnapshots = async (req, res) => {
  try {
    const { branchName, branchCode, startDate, endDate, currency } = req.query;
    const q = {};
    if (branchName) q.branchName = branchName;
    if (branchCode) q.branchCode = branchCode;
    if (currency) q.currency = currency;
    if (startDate || endDate) {
      const start = startDate ? toDateKey(startDate) : undefined;
      const end = endDate ? toDateKey(endDate) : undefined;
      if (start && end) q.dateKey = { $gte: start, $lte: end };
      else if (start) q.dateKey = { $gte: start };
      else if (end) q.dateKey = { $lte: end };
    }

    const results = await FinancialSnapshot.find(q).sort({ dateKey: -1, currency: 1 });
    if (results.length > 0) {
      return res.json(results);
    }

    // Fallback: if branchCode given but no docs matched (possible when updates use registry ID and doc lacks branchCode),
    // try resolving the registry-mapped snapshot and return it if it matches the currency filter (if any).
    if (branchCode) {
      try {
        const reg = await BranchRegistry.findOne({ branchCode }).select('snapshotId').lean();
        if (reg && reg.snapshotId) {
          const snap = await FinancialSnapshot.findById(reg.snapshotId).lean();
          if (snap) {
            if (!currency || snap.currency === currency) {
              return res.json([snap]);
            }
          }
        }
      } catch (e) {
        console.error('[SNAPSHOT] getSnapshots registry fallback failed', e);
      }
    }

    return res.json([]);
  } catch (error) {
    console.error('[SNAPSHOT] getSnapshots error', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// GET /api/snapshots/:id
exports.getSnapshotById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const snap = await FinancialSnapshot.findById(id);
    if (!snap) return res.status(404).json({ message: 'Snapshot not found' });
    res.json(snap);
  } catch (error) {
    console.error('[SNAPSHOT] getSnapshotById error', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};
