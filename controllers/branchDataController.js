const BranchData = require('../models/BranchData');

// Helper to detect approver roles
const isApprover = (user) => {
  const role = user?.role || '';
  return ['admin', 'branch head'].includes(role);
};

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
      dataDate: req.body.dataDate ? new Date(req.body.dataDate) : new Date(),
      recordedBy: user.id || req.body.recordedBy,
      status: shouldAutoApprove ? 'approved' : 'pending',
      approvedBy: shouldAutoApprove ? user.id : undefined,
      updatedAt: Date.now(),
    };

    const doc = await BranchData.findOneAndUpdate(
      { branchCode },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'username email');

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
      ...(req.body.dataDate && { dataDate: new Date(req.body.dataDate) }),
      updatedAt: Date.now(),
    };

    // If not approver, set status back to pending and clear approvedBy
    if (!isApprover(user)) {
      update.status = 'pending';
      update.approvedBy = undefined;
    }

    const doc = await BranchData.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'username email');

    if (!doc) return res.status(404).json({ message: 'Branch data not found' });

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

    const doc = await BranchData.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'username email');

    if (!doc) return res.status(404).json({ message: 'Branch data not found' });

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
