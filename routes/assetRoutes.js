const express = require('express');
const router = express.Router();
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const {
  createAsset,
  getAllAssets,
  getAssetById,
  updateAsset,
  deleteAsset
} = require('../controllers/assetController');

// Allowed roles for assets management
const ALLOWED_ROLES = ['admin', 'manager'];

// Identify user for all routes in this file
router.use(identifyUserFromHeader);

// @route   POST api/assets
// @desc    Create an asset
router.post('/', authorizeRoles(...ALLOWED_ROLES), createAsset);

// @route   GET api/assets
// @desc    Get all assets
router.get('/', authorizeRoles(...ALLOWED_ROLES), getAllAssets);

// @route   GET api/assets/:id
// @desc    Get asset by ID
router.get('/:id', authorizeRoles(...ALLOWED_ROLES), getAssetById);

// @route   PUT api/assets/:id
// @desc    Update an asset
router.put('/:id', authorizeRoles(...ALLOWED_ROLES), updateAsset);

// @route   DELETE api/assets/:id
// @desc    Delete an asset
router.delete('/:id', authorizeRoles(...ALLOWED_ROLES), deleteAsset);

module.exports = router;
