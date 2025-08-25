const express = require('express');
const router = express.Router();
const { computeDailySnapshot, getSnapshots, getSnapshotById } = require('../controllers/snapshotController');

// Compute and upsert a daily snapshot for a branch/date/currency
router.post('/compute', computeDailySnapshot);

// Query snapshots by filters
router.get('/', getSnapshots);

// Get single snapshot
router.get('/:id', getSnapshotById);

module.exports = router;
