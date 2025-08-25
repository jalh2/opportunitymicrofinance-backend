const SavingsAccount = require('../models/Savings');
const Client = require('../models/Client');

// Create a new savings account for a client
exports.createSavingsAccount = async (req, res) => {
    const { clientId, currency } = req.body;
    try {
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        let account = await SavingsAccount.findOne({ client: clientId });
        if (account) {
            return res.status(400).json({ message: 'Savings account already exists for this client' });
        }

        account = new SavingsAccount({
            client: clientId,
            group: client.group,
            currency: currency || 'LRD'
        });

        await account.save();
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
        const account = await SavingsAccount.findById(req.params.id).populate('client').populate('group');
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
    const { savingAmount, withdrawalAmount, tellerSignature, managerSignature, type } = req.body;

    try {
        const account = await SavingsAccount.findById(req.params.id);
        if (!account) {
            return res.status(404).json({ message: 'Savings account not found' });
        }

        // Backward compatibility: ensure account has a currency
        if (!account.currency) {
            account.currency = 'LRD';
            await account.save();
        }

        const balanceChange = (savingAmount || 0) - (withdrawalAmount || 0);
        const newBalance = account.currentBalance + balanceChange;

        if (newBalance < 0) {
            return res.status(400).json({ message: 'Insufficient funds for withdrawal' });
        }

        // Normalize and validate type
        const allowedTypes = ['personal', 'security', 'other'];
        const txType = allowedTypes.includes(type) ? type : 'personal';

        const transaction = {
            date: new Date(),
            savingAmount,
            withdrawalAmount,
            balance: newBalance,
            currency: account.currency,
            type: txType,
            tellerSignature,
            managerSignature
        };

        account.transactions.push(transaction);
        account.currentBalance = newBalance;

        await account.save();
        res.status(201).json(account);
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: 'Error adding transaction', error: error.message });
    }
};
