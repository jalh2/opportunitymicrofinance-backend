const Asset = require('../models/Asset');

// Create a new asset
exports.createAsset = async (req, res) => {
  try {
    const asset = new Asset(req.body);
    await asset.save();
    res.status(201).json(asset);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error creating asset', error: error.message });
  }
};

// Get all assets
exports.getAllAssets = async (req, res) => {
  try {
    const assets = await Asset.find();
    res.json(assets);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get asset by ID
exports.getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    res.json(asset);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Update an asset
exports.updateAsset = async (req, res) => {
  try {
    const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    res.json(asset);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error updating asset', error: error.message });
  }
};

// Delete an asset
exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    await Asset.findByIdAndRemove(req.params.id);
    res.json({ message: 'Asset removed' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};
