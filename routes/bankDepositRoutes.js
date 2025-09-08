const express = require('express');
const router = express.Router();
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { roles } = require('../config/roles');
const {
  bootstrapAccounts,
  createAccount,
  getAllAccounts,
  getAccountById,
  addTransaction,
  getTotalAcrossBranches,
} = require('../controllers/bankDepositController');

// Allowed roles: all except 'loan officer'
const ALLOWED_ROLES = roles.filter(r => r !== 'loan officer');

// Identify user for all routes
router.use(identifyUserFromHeader);

// Bootstrap accounts for all branches
router.post('/bootstrap', authorizeRoles(...ALLOWED_ROLES), bootstrapAccounts);

// Create a single account (by branch)
router.post('/', authorizeRoles(...ALLOWED_ROLES), createAccount);

// List all accounts
router.get('/', authorizeRoles(...ALLOWED_ROLES), getAllAccounts);

// Total across branches (currency-scoped)
router.get('/total', authorizeRoles(...ALLOWED_ROLES), getTotalAcrossBranches);

// Get account by id
router.get('/:id', authorizeRoles(...ALLOWED_ROLES), getAccountById);

// Add transaction to account
router.post('/:id/transactions', authorizeRoles(...ALLOWED_ROLES), addTransaction);

module.exports = router;
