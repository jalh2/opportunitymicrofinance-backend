const express = require('express');
const router = express.Router();
const {
  createBranchData,
  getAllBranchData,
  getBranchDataById,
  updateBranchData,
  updateBranchDataStatus,
  deleteBranchData,
} = require('../controllers/branchDataController');
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { roles } = require('../config/roles');

// Allowed roles: all except 'loan officer' (for general CRUD and reads)
const ALLOWED_ROLES = roles.filter(r => r !== 'loan officer');

// Identify user for all routes in this file
router.use(identifyUserFromHeader);

// Create new branch data
router.post('/', authorizeRoles(...ALLOWED_ROLES), createBranchData);

// Get all branch data with filtering
router.get('/', authorizeRoles(...ALLOWED_ROLES), getAllBranchData);

// Get branch data by ID
router.get('/:id', authorizeRoles(...ALLOWED_ROLES), getBranchDataById);

// Update branch data (identify so we can enforce re-approval for non-approvers)
router.put('/:id', authorizeRoles(...ALLOWED_ROLES), updateBranchData);

// Update status (approve/reject) - only admin or branch head can do this
router.patch('/:id/status', authorizeRoles('admin', 'branch head'), updateBranchDataStatus);

// Delete branch data - only admin or branch head
router.delete('/:id', authorizeRoles('admin', 'branch head'), deleteBranchData);

module.exports = router;
