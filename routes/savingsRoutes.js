const express = require('express');
const router = express.Router();
const {
  createSavingsAccount,
  getAllSavingsAccounts,
  getSavingsAccountById,
  addTransaction
} = require('../controllers/savingsController');
const { identifyUserFromHeader } = require('../middleware/authMiddleware');

// @route   POST api/savings
// @desc    Create a savings account
router.post('/', identifyUserFromHeader, createSavingsAccount);

// @route   GET api/savings
// @desc    Get all savings accounts
router.get('/', getAllSavingsAccounts);

// @route   GET api/savings/:id
// @desc    Get savings account by ID
router.get('/:id', getSavingsAccountById);

// @route   POST api/savings/:id/transactions
// @desc    Add a savings transaction
router.post('/:id/transactions', identifyUserFromHeader, addTransaction);

module.exports = router;
