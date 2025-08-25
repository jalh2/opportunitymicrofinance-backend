const express = require('express');
const router = express.Router();
const { getAllBranches } = require('../controllers/branchController');

const { identifyUserFromHeader } = require('../middleware/authMiddleware');

// @route   GET /api/branches
router.get('/', identifyUserFromHeader, getAllBranches);

module.exports = router;
