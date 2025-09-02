const PersonalSavingsAccount = require('../models/PersonalSavings');
const Client = require('../models/Client');
const Group = require('../models/Group');
const snapshotService = require('../services/snapshotService');

// Create a new personal savings account for an individual client
exports.createPersonalSavingsAccount = async (req, res) => {
  const { clientId, currency } = req.body;
  try {
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    const client = await Client.findById(clientId).select('group branchName branchCode');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Ensure one account per client
    const existing = await PersonalSavingsAccount.findOne({ client: client._id });
    if (existing) {
      return res.status(400).json({ message: 'Personal savings account already exists for this client' });
    }

    // Derive group context if available (for audit context only)
    const group = client.group ? await Group.findById(client.group).select('_id') : null;

    const account = new PersonalSavingsAccount({
      client: client._id,
      group: group ? group._id : undefined,
      currency: currency || 'LRD',
    });

    await account.save();
    await account.populate('client', 'memberName passBookNumber');
    res.status(201).json(account);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get all personal savings accounts (client-scoped)
exports.getAllPersonalSavingsAccounts = async (req, res) => {
  try {
    const accounts = await PersonalSavingsAccount.find()
      .populate('client', 'memberName passBookNumber')
      .populate('group', 'groupName');
    res.json(accounts);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get personal savings account by ID
exports.getPersonalSavingsAccountById = async (req, res) => {
  try {
    const account = await PersonalSavingsAccount.findById(req.params.id)
      .populate('client')
      .populate('group');
    if (!account) {
      return res.status(404).json({ message: 'Personal savings account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Add a personal savings transaction (deposit or withdrawal)
// Snapshot increments ONLY personal metrics: totalPersonalSavingsBalance and totalPersonalSavingsFlow
exports.addPersonalTransaction = async (req, res) => {
  const { savingAmount, withdrawalAmount, tellerSignature, managerSignature, clientId } = req.body;

  try {
    const account = await PersonalSavingsAccount.findById(req.params.id)
      .populate('group', 'groupName groupCode branchName')
      .populate('client', 'branchName branchCode');
    if (!account) {
      return res.status(404).json({ message: 'Personal savings account not found' });
    }

    // If a clientId is supplied, ensure it matches the account's client
    if (clientId && String(clientId) !== String(account.client._id || account.client)) {
      return res.status(400).json({ message: 'clientId does not match this personal savings account' });
    }

    // Ensure currency
    if (!account.currency) {
      account.currency = 'LRD';
      await account.save();
    }

    const deposit = Number(savingAmount || 0);
    const withdraw = Number(withdrawalAmount || 0);
    const balanceChange = deposit - withdraw;
    const newBalance = Number(account.currentBalance || 0) + balanceChange;

    if (newBalance < 0) {
      return res.status(400).json({ message: 'Insufficient funds for withdrawal' });
    }

    const transaction = {
      date: new Date(),
      savingAmount: deposit,
      withdrawalAmount: withdraw,
      balance: newBalance,
      currency: account.currency,
      tellerSignature,
      managerSignature,
    };

    account.transactions.push(transaction);
    account.currentBalance = newBalance;

    await account.save();

    // Update personal savings snapshot metrics only (soft-fail)
    try {
      const branchName = (req.user && req.user.branch) ||
                        (account.client && account.client.branchName) ||
                        (account.group && account.group.branchName) || '';
      const branchCode = (req.user && req.user.branchCode) ||
                        (account.client && account.client.branchCode) || '';

      const inc = {
        totalPersonalSavingsFlow: balanceChange,
        totalPersonalSavingsBalance: balanceChange,
      };

      await snapshotService.incrementMetrics({
        branchName,
        branchCode,
        currency: account.currency || 'LRD',
        date: transaction.date,
        inc,
        group: (account.group && (account.group._id || account.group)) || null,
        groupName: (account.group && account.group.groupName) || '',
        groupCode: (account.group && account.group.groupCode) || '',
        updatedBy: (req.user && req.user.id) || null,
        updatedByName: (req.user && req.user.username) || '',
        updatedByEmail: (req.user && req.user.email) || '',
        updateSource: 'personalSavingsTransaction',
      });
    } catch (e) {
      console.error('[SNAPSHOT] personal savings increment failed', e);
    }

    res.status(201).json(account);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error adding transaction', error: error.message });
  }
};
