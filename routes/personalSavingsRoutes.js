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

// Identify user for all routes in this file
router.use(identifyUserFromHeader);

// Create a savings account (shared account per group)
router.post('/', authorizeRoles(...ALLOWED_ROLES), createPersonalSavingsAccount);

// List all accounts
router.get('/', authorizeRoles(...ALLOWED_ROLES), getAllPersonalSavingsAccounts);

// Get account by ID
router.get('/:id', authorizeRoles(...ALLOWED_ROLES), getPersonalSavingsAccountById);

// Add a personal transaction
router.post('/:id/transactions', authorizeRoles(...ALLOWED_ROLES), addPersonalTransaction);

module.exports = router;
