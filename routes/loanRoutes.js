const express = require('express');
const router = express.Router();
const {
  createLoan,
  getAllLoans,
  getLoanById,
  updateLoan,
  deleteLoan,
  addCollection,
  addCollectionsBatch,
  setLoanStatus
} = require('../controllers/loanController');
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { getDistributionsByLoan, createDistribution } = require('../controllers/distributionController');

// @route   POST api/loans
// @desc    Create a loan
router.post('/', createLoan);

// @route   GET api/loans
// @desc    Get all loans
router.get('/', getAllLoans);

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
  authorizeRoles('admin', 'manager', 'branch head'),
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
  authorizeRoles('admin', 'manager', 'branch head', 'loan officer', 'staff', 'field agent'),
  createDistribution
);

module.exports = router;
