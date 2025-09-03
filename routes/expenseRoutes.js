const express = require('express');
const router = express.Router();
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { roles } = require('../config/roles');
const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  updateExpenseStatus,
  getExpenseAnalytics
} = require('../controllers/expenseController');

// Allowed roles: all except 'loan officer'
const ALLOWED_ROLES = roles.filter(r => r !== 'loan officer');

// Identify user for all routes in this file
router.use(identifyUserFromHeader);

// Create new expense
router.post('/', authorizeRoles(...ALLOWED_ROLES), createExpense);

// Get all expenses with filtering
router.get('/', authorizeRoles(...ALLOWED_ROLES), getAllExpenses);

// Get expense analytics/reports
router.get('/analytics', authorizeRoles(...ALLOWED_ROLES), getExpenseAnalytics);

// Get expense by ID
router.get('/:id', authorizeRoles(...ALLOWED_ROLES), getExpenseById);

// Update expense
router.put('/:id', authorizeRoles(...ALLOWED_ROLES), updateExpense);

// Update expense status (approve/reject/pay)
router.patch('/:id/status', authorizeRoles(...ALLOWED_ROLES), updateExpenseStatus);

// Delete expense
router.delete('/:id', authorizeRoles(...ALLOWED_ROLES), deleteExpense);

module.exports = router;
