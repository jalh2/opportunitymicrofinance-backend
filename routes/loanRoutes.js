const express = require('express');
const router = express.Router();
const {
  createLoan,
  getAllLoans,
  getLoansCount,
  getLoanById,
  updateLoan,
  deleteLoan,
  addCollection,
  addCollectionsBatch,
  setLoanStatus,
  listCollectionsDue
} = require('../controllers/loanController');
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { getDistributionsByLoan, createDistribution, getDistributionSummaryByGroup } = require('../controllers/distributionController');

// @route   POST api/loans
// @desc    Create a loan
router.post('/', createLoan);

// @route   GET api/loans
// @desc    Get all loans
router.get('/', getAllLoans);

// @route   GET api/loans/count
// @desc    Get loans count (optionally filtered by branchCode)
router.get('/count', getLoansCount);

// @route   GET api/loans/collections-due
// @desc    List loans due for collection within a date range
router.get(
  '/collections-due',
  identifyUserFromHeader,
  authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'field agent', 'board chair', 'board chairman'),
  listCollectionsDue
);

// @route   GET api/loans/:id
// @desc    Get loan by ID
router.get('/:id', getLoanById);

// @route   PUT api/loans/:id
// @desc    Update a loan
router.put('/:id', updateLoan);

// @route   PATCH api/loans/:id/status
// @desc    Update loan status (approve, etc.) - restricted roles
router.patch(
  '/:id/status',
  identifyUserFromHeader,
  authorizeRoles('admin', 'manager', 'branch head', 'board chair', 'board chairman'),
  setLoanStatus
);

// @route   DELETE api/loans/:id
// @desc    Delete a loan
router.delete('/:id', deleteLoan);

// @route   POST api/loans/:id/collections
// @desc    Add a collection record to a loan
router.post('/:id/collections', addCollection);

// @route   POST api/loans/:id/collections/batch
// @desc    Add multiple collection records to a loan
router.post('/:id/collections/batch', addCollectionsBatch);

// @route   GET api/loans/:id/distributions
// @desc    List distributions for a loan
router.get('/:id/distributions', getDistributionsByLoan);

// @route   POST api/loans/:id/distributions
// @desc    Create a distribution (or batch with { entries: [...] })
router.post(
  '/:id/distributions',
  identifyUserFromHeader,
  authorizeRoles('admin', 'manager', 'branch head', 'loan officer', 'staff', 'field agent', 'board chair', 'board chairman'),
  createDistribution
);

// @route   GET api/loans/group/:id/distributions/summary
// @desc    Summarize distribution coverage for all loans in a group
router.get('/group/:id/distributions/summary', getDistributionSummaryByGroup);

module.exports = router;
