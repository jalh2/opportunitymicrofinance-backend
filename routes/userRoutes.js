const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  createUser,
  changePassword,
  getLoanOfficers,
  getBranches,
} = require('../controllers/userController');
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');

// Apply user identification middleware to all routes in this file
router.use(identifyUserFromHeader);

// @route   GET api/users/loan-officers
// @desc    Get all loan officers
// @access  Admin, Manager, Branch Head, Staff, Field Agent, Loan Officer
router.get('/loan-officers', authorizeRoles('admin', 'manager', 'branch head', 'staff', 'field agent', 'loan officer', 'board chair', 'board chairman'), getLoanOfficers);

// @route   GET api/users/branches
// @desc    Get all branches
// @access  Admin, Manager, Branch Head, Staff, Field Agent, Loan Officer
router.get('/branches', authorizeRoles('admin', 'manager', 'branch head', 'staff', 'field agent', 'loan officer', 'board chair', 'board chairman'), getBranches);

// --- Admin Only Routes ---

// @route   GET api/users
// @desc    Get all users
// @access  Admin only
router.get('/', authorizeRoles('admin', 'board chair', 'board chairman'), getAllUsers);

// @route   GET api/users/:id
// @desc    Get user by ID
// @access  Admin only
router.get('/:id', authorizeRoles('admin', 'board chair', 'board chairman'), getUserById);

// @route   POST api/users
// @desc    Create/register a user (admin)
// @access  Admin only
router.post('/', authorizeRoles('admin', 'board chair', 'board chairman'), createUser);

// @route   PUT api/users/:id
// @desc    Update a user
// @access  Admin only
router.put('/:id', authorizeRoles('admin', 'board chair', 'board chairman'), updateUser);

// @route   PATCH api/users/:id/password
// @desc    Change/reset a user's password (admin)
// @access  Admin only
router.patch('/:id/password', authorizeRoles('admin', 'board chair', 'board chairman'), changePassword);

// @route   DELETE api/users/:id
// @desc    Delete a user
// @access  Admin only
router.delete('/:id', authorizeRoles('admin', 'board chair', 'board chairman'), deleteUser);

module.exports = router;
