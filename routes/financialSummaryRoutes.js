const express = require('express');
const router = express.Router();
const { getFinancialSummary } = require('../controllers/financialSummaryController');
// const { identifyUserFromHeader } = require('../middleware/authMiddleware');

// @route   GET /api/financial-summary
router.get('/', getFinancialSummary);

module.exports = router;
