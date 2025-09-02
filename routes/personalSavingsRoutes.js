const express = require('express');
const router = express.Router();
const {
  createPersonalSavingsAccount,
  getAllPersonalSavingsAccounts,
  getPersonalSavingsAccountById,
  addPersonalTransaction,
} = require('../controllers/personalSavingsController');
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');

// Roles allowed to manage personal savings
const ALLOWED_ROLES = ['admin', 'manager', 'branch head'];

// Create a savings account (shared account per group)
router.post('/', identifyUserFromHeader, authorizeRoles(...ALLOWED_ROLES), createPersonalSavingsAccount);

// List all accounts
router.get('/', getAllPersonalSavingsAccounts);

// Get account by ID
router.get('/:id', getPersonalSavingsAccountById);

// Add a personal transaction
router.post('/:id/transactions', identifyUserFromHeader, authorizeRoles(...ALLOWED_ROLES), addPersonalTransaction);

module.exports = router;
