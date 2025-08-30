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

// Create new branch data
router.post('/', identifyUserFromHeader, createBranchData);

// Get all branch data with filtering
router.get('/', getAllBranchData);

// Get branch data by ID
router.get('/:id', getBranchDataById);

// Update branch data (identify so we can enforce re-approval for non-approvers)
router.put('/:id', identifyUserFromHeader, updateBranchData);

// Update status (approve/reject) - only admin or branch head can do this
router.patch('/:id/status', identifyUserFromHeader, authorizeRoles('admin', 'branch head'), updateBranchDataStatus);

// Delete branch data - only admin or branch head
router.delete('/:id', identifyUserFromHeader, authorizeRoles('admin', 'branch head'), deleteBranchData);

module.exports = router;
