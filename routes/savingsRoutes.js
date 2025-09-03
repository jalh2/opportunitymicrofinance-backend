const express = require('express');
const router = express.Router();
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { roles } = require('../config/roles');
const {
  createSavingsAccount,
  getAllSavingsAccounts,
  getSavingsAccountById,
  addTransaction
} = require('../controllers/savingsController');

// Allowed roles: all except 'loan officer'
const ALLOWED_ROLES = roles.filter(r => r !== 'loan officer');

// Identify user for all routes
router.use(identifyUserFromHeader);

// @route   POST api/savings
// @desc    Create a savings account
router.post('/', authorizeRoles(...ALLOWED_ROLES), createSavingsAccount);

// @route   GET api/savings
// @desc    Get all savings accounts
router.get('/', authorizeRoles(...ALLOWED_ROLES), getAllSavingsAccounts);

// @route   GET api/savings/:id
// @desc    Get savings account by ID
router.get('/:id', authorizeRoles(...ALLOWED_ROLES), getSavingsAccountById);

// @route   POST api/savings/:id/transactions
// @desc    Add a savings transaction
router.post('/:id/transactions', authorizeRoles(...ALLOWED_ROLES), addTransaction);

module.exports = router;
