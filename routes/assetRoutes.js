const express = require('express');
const router = express.Router();
const {
  createAsset,
  getAllAssets,
  getAssetById,
  updateAsset,
  deleteAsset
} = require('../controllers/assetController');

// @route   POST api/assets
// @desc    Create an asset
router.post('/', createAsset);

// @route   GET api/assets
// @desc    Get all assets
router.get('/', getAllAssets);

// @route   GET api/assets/:id
// @desc    Get asset by ID
router.get('/:id', getAssetById);

// @route   PUT api/assets/:id
// @desc    Update an asset
router.put('/:id', updateAsset);

// @route   DELETE api/assets/:id
// @desc    Delete an asset
router.delete('/:id', deleteAsset);

module.exports = router;
