const BankDepositAccount = require('../models/BankDepositSaving');
const User = require('../models/User');
const snapshotService = require('../services/snapshotService');

// Ensure an account exists for the provided branch (by code/name)
async function ensureAccount({ branchName, branchCode, currency = 'LRD' }) {
  if (!branchCode || !branchName) return null;
  let acct = await BankDepositAccount.findOne({ branchCode, currency });
  if (!acct) {
    acct = await BankDepositAccount.create({ branchName, branchCode, currency, currentBalance: 0, transactions: [] });
  }
  return acct;
}

// POST /api/bank-deposit-savings/bootstrap
// Creates an account per unique branch in the User database (default currency LRD)
exports.bootstrapAccounts = async (req, res) => {
  try {
    const users = await User.find({}, 'branch branchCode').lean();
    const seen = new Map();
    for (const u of users) {
      if (!u.branchCode) continue;
      if (!seen.has(u.branchCode)) {
        seen.set(u.branchCode, u.branch || '');
      }
    }
    const results = [];
    for (const [code, name] of seen.entries()) {
      for (const ccy of ['LRD', 'USD']) {
        const acct = await ensureAccount({ branchName: name || '', branchCode: code, currency: ccy });
        if (acct) results.push(acct);
      }
    }
    res.json({ createdOrExisting: results.length, accounts: results });
  } catch (e) {
    console.error('[BankDeposit] bootstrapAccounts error', e);
    res.status(500).json({ message: 'Failed to bootstrap bank deposit accounts' });
  }
};

// POST /api/bank-deposit-savings
// Manually create an account for a branch (rarely needed; normally bootstrap handles it)
exports.createAccount = async (req, res) => {
  try {
    const branchName = (req.body.branchName || (req.user && req.user.branch) || '').trim();
    const branchCode = (req.body.branchCode || (req.user && req.user.branchCode) || '').trim();
    const currency = req.body.currency || 'LRD';
    if (!branchCode) return res.status(400).json({ message: 'branchCode is required' });
    const existing = await BankDepositAccount.findOne({ branchCode, currency });
    if (existing) return res.status(400).json({ message: 'Account already exists for this branch/currency' });
    const acct = await BankDepositAccount.create({ branchName, branchCode, currency, currentBalance: 0 });
    res.status(201).json(acct);
  } catch (e) {
    console.error('[BankDeposit] createAccount error', e);
    res.status(500).json({ message: 'Failed to create account' });
  }
};

// GET /api/bank-deposit-savings
exports.getAllAccounts = async (req, res) => {
  try {
    // Auto-ensure an account exists for each unique branch (LRD by default)
    const users = await User.find({}, 'branch branchCode').lean();
    const map = new Map();
    for (const u of users) {
      if (!u.branchCode) continue;
      if (!map.has(u.branchCode)) {
        map.set(u.branchCode, u.branch || '');
      }
    }
    for (const [code, name] of map.entries()) {
      for (const ccy of ['LRD', 'USD']) {
        await ensureAccount({ branchName: name || '', branchCode: code, currency: ccy });
      }
    }
    const accounts = await BankDepositAccount.find().sort({ branchName: 1 }).lean();
    res.json(accounts);
  } catch (e) {
    console.error('[BankDeposit] getAllAccounts error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/bank-deposit-savings/:id
exports.getAccountById = async (req, res) => {
  try {
    const acct = await BankDepositAccount.findById(req.params.id);
    if (!acct) return res.status(404).json({ message: 'Account not found' });
    res.json(acct);
  } catch (e) {
    console.error('[BankDeposit] getAccountById error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/bank-deposit-savings/:id/transactions
exports.addTransaction = async (req, res) => {
  try {
    const { depositAmount = 0, withdrawalAmount = 0, tellerSignature, managerSignature, note } = req.body || {};
    const acct = await BankDepositAccount.findById(req.params.id);
    if (!acct) return res.status(404).json({ message: 'Account not found' });

    // Ensure currency present
    if (!acct.currency) acct.currency = 'LRD';

    const dep = Number(depositAmount || 0);
    const wd = Number(withdrawalAmount || 0);
    const delta = dep - wd;
    const newBal = Number(acct.currentBalance || 0) + delta;
    if (newBal < 0) return res.status(400).json({ message: 'Insufficient funds for withdrawal' });

    const tx = {
      date: new Date(),
      depositAmount: dep,
      withdrawalAmount: wd,
      balance: newBal,
      currency: acct.currency,
      tellerSignature,
      managerSignature,
      note,
    };

    acct.transactions.push(tx);
    acct.currentBalance = newBal;
    await acct.save();

    // Snapshot increment (soft-fail)
    try {
      const branchName = (req.user && req.user.branch) || acct.branchName || '';
      const branchCode = (req.user && req.user.branchCode) || acct.branchCode || '';
      await snapshotService.incrementMetrics({
        branchName,
        branchCode,
        currency: acct.currency,
        date: tx.date,
        inc: { bankDepositSaving: delta },
        updatedBy: (req.user && req.user.id) || null,
        updatedByName: (req.user && req.user.username) || '',
        updatedByEmail: (req.user && req.user.email) || '',
        updateSource: 'bankDepositTransaction',
      });
    } catch (err) {
      console.error('[SNAPSHOT] bank deposit increment failed', err);
    }

    res.status(201).json(acct);
  } catch (e) {
    console.error('[BankDeposit] addTransaction error', e);
    res.status(400).json({ message: 'Error adding transaction', error: e.message });
  }
};

// GET /api/bank-deposit-savings/total?currency=
// Returns sum of current balances across all branches for the currency
exports.getTotalAcrossBranches = async (req, res) => {
  try {
    const currency = (req.query.currency || 'LRD').toUpperCase();
    const match = { currency };
    const agg = await BankDepositAccount.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$currentBalance', 0] } } } }
    ]);
    const total = (agg[0] && agg[0].total) || 0;
    res.json({ currency, total });
  } catch (e) {
    console.error('[BankDeposit] getTotalAcrossBranches error', e);
    res.status(500).json({ message: 'Server error' });
  }
};
