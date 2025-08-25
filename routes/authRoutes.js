const express = require('express');
const router = express.Router();
const { register, login, listBranchesForLogin, listUsersForLogin } = require('../controllers/authController');

// @route   POST api/auth/register
// @desc    Register a user
// @access  Public
router.post('/register', register);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', login);

// Public endpoints to support pre-login selection
router.get('/branches', listBranchesForLogin);
router.get('/users', listUsersForLogin);


module.exports = router;
