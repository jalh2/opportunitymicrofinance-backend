const express = require('express');
const router = express.Router();
const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  updateExpenseStatus,
  getExpenseAnalytics
} = require('../controllers/expenseController');

// Create new expense
router.post('/', createExpense);

// Get all expenses with filtering
router.get('/', getAllExpenses);

// Get expense analytics/reports
router.get('/analytics', getExpenseAnalytics);

// Get expense by ID
router.get('/:id', getExpenseById);

// Update expense
router.put('/:id', updateExpense);

// Update expense status (approve/reject/pay)
router.patch('/:id/status', updateExpenseStatus);

// Delete expense
router.delete('/:id', deleteExpense);

module.exports = router;
