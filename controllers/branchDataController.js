const BranchData = require('../models/BranchData');
const { incrementMetrics } = require('../services/metricService');

// Helper to detect approver roles
const isApprover = (user) => {
  const role = user?.role || '';
  return ['admin', 'branch head'].includes(role);
};

// Apply manual metrics to FinancialSnapshot when approved, using delta vs last applied
async function applySnapshotAdjustments(doc, user, source = 'branchDataManual') {
  try {
    if (!doc || doc.status !== 'approved') return doc;
    const fields = ['loanOfficerShortage', 'branchShortage', 'entityShortage', 'badDebt'];
    const inc = {};
    const current = {};
    fields.forEach(f => {
      current[f] = Number(doc[f] || 0);
      const prev = Number((doc.appliedMetrics && doc.appliedMetrics[f]) || 0);
      const delta = Number(current[f]) - Number(prev);
      if (delta !== 0) inc[f] = delta;
    });
    if (Object.keys(inc).length === 0) {
      return doc;
    }
    const date = doc.dataDate ? new Date(doc.dataDate) : new Date();
    await incrementMetrics({
      branchName: doc.branchName || '',
      branchCode: doc.branchCode || '',
      currency: doc.currency || 'LRD',
      date,
      inc,
      // audit
      updatedBy: user && user.id ? user.id : null,
      updatedByName: user && user.username ? user.username : '',
      updatedByEmail: user && user.email ? user.email : '',
      // rich context
      loanOfficerName: (user && user.username) || '',
      updateSource: source,
    });
    // Persist new appliedMetrics snapshot for idempotency
    const applied = {
      date,
      currency: doc.currency || 'LRD',
      loanOfficerShortage: current.loanOfficerShortage || 0,
      branchShortage: current.branchShortage || 0,
      entityShortage: current.entityShortage || 0,
      badDebt: current.badDebt || 0,
      appliedAt: new Date(),
      appliedBy: user && user.id ? user.id : undefined,
    };
    const updated = await BranchData.findByIdAndUpdate(
      doc._id,
      { $set: { appliedMetrics: applied } },
      { new: true }
    ).populate('recordedBy approvedBy', 'username email');
    return updated || doc;
  } catch (e) {
    console.error('[BRANCH_DATA] applySnapshotAdjustments error', e.message);
    return doc;
  }
}

// Create a new Branch Data record
exports.createBranchData = async (req, res) => {
  try {
    const user = req.user || {};

    const branchName = req.body.branchName || user.branch || '';
    const branchCode = req.body.branchCode || user.branchCode || '';
    const currency = req.body.currency || 'LRD';

    const shouldAutoApprove = isApprover(user);

    const update = {
      branchName,
      branchCode,
      currency,
      goodsCollectedBank: Number(req.body.goodsCollectedBank || 0),
      goodsCollectedOffice: Number(req.body.goodsCollectedOffice || 0),
      finalOfficeBalance: Number(req.body.finalOfficeBalance || 0),
      // manual metrics
      loanOfficerShortage: Number(req.body.loanOfficerShortage || 0),
      branchShortage: Number(req.body.branchShortage || 0),
      entityShortage: Number(req.body.entityShortage || 0),
      badDebt: Number(req.body.badDebt || 0),
      dataDate: req.body.dataDate ? new Date(req.body.dataDate) : new Date(),
      recordedBy: user.id || req.body.recordedBy,
      status: shouldAutoApprove ? 'approved' : 'pending',
      approvedBy: shouldAutoApprove ? user.id : undefined,
      updatedAt: Date.now(),
    };

    let doc = await BranchData.findOneAndUpdate(
      { branchCode },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'username email');

    // If auto-approved or already approved, apply deltas to FinancialSnapshot
    if (doc && doc.status === 'approved') {
      doc = await applySnapshotAdjustments(doc, user, 'branchDataCreate');
    }

    res.status(201).json(doc);
  } catch (error) {
    console.error('[BRANCH_DATA] upsert error', error.message);
    res.status(400).json({ message: 'Error upserting branch data', error: error.message });
  }
};

// Get all Branch Data with filtering and pagination
exports.getAllBranchData = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      branchCode,
      currency,
      status,
      startDate,
      endDate,
    } = req.query;

    const filter = {};
    if (branchCode) filter.branchCode = branchCode;
    if (currency) filter.currency = currency;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.dataDate = {};
      if (startDate) filter.dataDate.$gte = new Date(startDate);
      if (endDate) filter.dataDate.$lte = new Date(endDate);
    }

    const items = await BranchData.find(filter)
      .populate('recordedBy approvedBy', 'username email')
      .sort({ dataDate: -1, createdAt: -1 })
      .limit(Number(limit) * 1)
      .skip((Number(page) - 1) * Number(limit));

    const total = await BranchData.countDocuments(filter);

    res.json({
      items,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error('[BRANCH_DATA] list error', error.message);
    res.status(500).json({ message: 'Error fetching branch data', error: error.message });
  }
};

// Get Branch Data by ID
exports.getBranchDataById = async (req, res) => {
  try {
    const doc = await BranchData.findById(req.params.id)
      .populate('recordedBy approvedBy', 'username email');
    if (!doc) return res.status(404).json({ message: 'Branch data not found' });
    res.json(doc);
  } catch (error) {
    console.error('[BRANCH_DATA] getById error', error.message);
    res.status(500).json({ message: 'Error fetching branch data', error: error.message });
  }
};

// Update Branch Data (non-approvers trigger re-approval)
exports.updateBranchData = async (req, res) => {
  try {
    const user = req.user || {};

    const update = {
      ...req.body,
      // Coerce numeric fields safely if present
      ...(req.body.goodsCollectedBank !== undefined && { goodsCollectedBank: Number(req.body.goodsCollectedBank) }),
      ...(req.body.goodsCollectedOffice !== undefined && { goodsCollectedOffice: Number(req.body.goodsCollectedOffice) }),
      ...(req.body.finalOfficeBalance !== undefined && { finalOfficeBalance: Number(req.body.finalOfficeBalance) }),
      ...(req.body.loanOfficerShortage !== undefined && { loanOfficerShortage: Number(req.body.loanOfficerShortage) }),
      ...(req.body.branchShortage !== undefined && { branchShortage: Number(req.body.branchShortage) }),
      ...(req.body.entityShortage !== undefined && { entityShortage: Number(req.body.entityShortage) }),
      ...(req.body.badDebt !== undefined && { badDebt: Number(req.body.badDebt) }),
      ...(req.body.dataDate && { dataDate: new Date(req.body.dataDate) }),
      updatedAt: Date.now(),
    };

    // If not approver, set status back to pending and clear approvedBy
    if (!isApprover(user)) {
      update.status = 'pending';
      update.approvedBy = undefined;
    }

    let doc = await BranchData.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'username email');

    if (!doc) return res.status(404).json({ message: 'Branch data not found' });

    if (doc.status === 'approved') {
      doc = await applySnapshotAdjustments(doc, user, 'branchDataUpdate');
    }

    res.json(doc);
  } catch (error) {
    console.error('[BRANCH_DATA] update error', error.message);
    res.status(400).json({ message: 'Error updating branch data', error: error.message });
  }
};

// Approve/Reject Branch Data
exports.updateBranchDataStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'approved', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const update = { status, updatedAt: Date.now() };
    if (status === 'approved' && req.user?.id) {
      update.approvedBy = req.user.id;
    }
    if (status !== 'approved') {
      update.approvedBy = undefined;
    }

    let doc = await BranchData.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'username email');

    if (!doc) return res.status(404).json({ message: 'Branch data not found' });

    if (doc.status === 'approved') {
      doc = await applySnapshotAdjustments(doc, req.user || {}, 'branchDataStatus');
    }

    res.json(doc);
  } catch (error) {
    console.error('[BRANCH_DATA] update status error', error.message);
    res.status(400).json({ message: 'Error updating status', error: error.message });
  }
};

// Delete Branch Data (admin/branch head via routes guard)
exports.deleteBranchData = async (req, res) => {
  try {
    const doc = await BranchData.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Branch data not found' });
    res.json({ message: 'Branch data deleted successfully' });
  } catch (error) {
    console.error('[BRANCH_DATA] delete error', error.message);
    res.status(500).json({ message: 'Error deleting branch data', error: error.message });
  }
};

