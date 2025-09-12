const SavingsAccount = require('../models/Savings');
const Client = require('../models/Client');
const Group = require('../models/Group');
const metricService = require('../services/metricService');

// Create a new savings account for a group (legacy support: clientId -> derive group)
exports.createSavingsAccount = async (req, res) => {
    const { groupId, clientId, currency } = req.body;
    try {
        let group = null;
        if (groupId) {
            group = await Group.findById(groupId);
            if (!group) {
                return res.status(404).json({ message: 'Group not found' });
            }
        } else if (clientId) {
            // Backward compatibility: allow creating by clientId, but store by group
            const client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({ message: 'Client not found' });
            }
            group = await Group.findById(client.group);
            if (!group) {
                return res.status(404).json({ message: "Client's group not found" });
            }
        } else {
            return res.status(400).json({ message: 'groupId is required' });
        }

        // Ensure one account per group
        const existing = await SavingsAccount.findOne({ group: group._id });
        if (existing) {
            return res.status(400).json({ message: 'Savings account already exists for this group' });
        }

        const account = new SavingsAccount({
            group: group._id,
            currency: currency || 'LRD'
        });

        await account.save();
        // populate minimal display fields
        await account.populate('group', 'groupName');
        res.status(201).json(account);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server error');
    }
};

// Get all savings accounts
exports.getAllSavingsAccounts = async (req, res) => {
    try {
        const accounts = await SavingsAccount.find().populate('client', 'memberName').populate('group', 'groupName');
        res.json(accounts);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server error');
    }
};

// Get savings account by ID
exports.getSavingsAccountById = async (req, res) => {
    try {
        const account = await SavingsAccount.findById(req.params.id)
          .populate('client')
          .populate('group')
          .populate({ path: 'transactions.client', select: 'memberName passBookNumber group' });
        if (!account) {
            return res.status(404).json({ message: 'Savings account not found' });
        }
        res.json(account);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server error');
    }
};

// Add a savings transaction (deposit or withdrawal)
exports.addTransaction = async (req, res) => {
    const { savingAmount, withdrawalAmount, tellerSignature, managerSignature, type, clientId } = req.body;

    try {
        const account = await SavingsAccount.findById(req.params.id)
          .populate('group', 'groupName groupCode branchName')
          .populate('client', 'branchName branchCode'); // legacy client field if present
        if (!account) {
            return res.status(404).json({ message: 'Savings account not found' });
        }

        let txClient = null;
        if (clientId) {
            txClient = await Client.findById(clientId).select('branchName branchCode group');
            if (!txClient) {
                return res.status(404).json({ message: 'Client not found' });
            }
            // Optional: ensure the client belongs to this account's group
            if (account.group && txClient.group && String(txClient.group) !== String(account.group._id || account.group)) {
                return res.status(400).json({ message: 'Client does not belong to this savings account\'s group' });
            }
        }

        // Backward compatibility: ensure account has a currency
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

        // Normalize and validate type
        const allowedTypes = ['personal', 'security', 'other'];
        const txType = allowedTypes.includes(type) ? type : 'personal';

        const transaction = {
            date: new Date(),
            savingAmount: deposit,
            withdrawalAmount: withdraw,
            balance: newBalance,
            currency: account.currency,
            type: txType,
            tellerSignature,
            managerSignature,
            client: txClient ? txClient._id : undefined,
        };

        account.transactions.push(transaction);
        account.currentBalance = newBalance;

        await account.save();

        // Record metrics (soft-fail if it errors)
        try {
          // Source branch identity from authenticated user first (most reliable), then fall back
          const branchName = (req.user && req.user.branch) ||
                            (txClient && txClient.branchName) ||
                            (account.client && account.client.branchName) ||
                            (account.group && account.group.branchName) || '';
          const branchCode = (req.user && req.user.branchCode) ||
                            (txClient && txClient.branchCode) ||
                            (account.client && account.client.branchCode) || '';

          const inc = {
            // aggregate flows and totals
            totalSavingsDeposits: deposit > 0 ? deposit : 0,
            totalSavingsWithdrawals: withdraw > 0 ? withdraw : 0,
            netSavingsFlow: balanceChange,
            // balances
            totalSavingsBalance: balanceChange,
          };

          // type-specific flows and balances
          if (txType === 'personal') {
            inc.totalPersonalSavingsFlow = balanceChange;
            inc.totalPersonalSavingsBalance = balanceChange;
          } else if (txType === 'security') {
            inc.totalSecurityDepositsFlow = balanceChange;
            inc.totalSecuritySavingsBalance = balanceChange;
          }

          await metricService.incrementMetrics({
            branchName,
            branchCode,
            currency: account.currency || 'LRD',
            date: transaction.date,
            inc,
            // audit/context
            group: (account.group && (account.group._id || account.group)) || null,
            groupName: (account.group && account.group.groupName) || '',
            groupCode: (account.group && account.group.groupCode) || '',
            updatedBy: (req.user && req.user.id) || null,
            updatedByName: (req.user && req.user.username) || '',
            updatedByEmail: (req.user && req.user.email) || '',
            // rich context
            client: (txClient && txClient._id) || undefined,
            loanOfficerName: (req.user && req.user.username) || '',
            updateSource: 'savingsTransaction',
          });
        } catch (e) {
          console.error('[METRICS] savings increment failed', e);
        }

        res.status(201).json(account);
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: 'Error adding transaction', error: error.message });
    }
};
