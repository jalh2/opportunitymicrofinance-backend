const asyncHandler = require('express-async-handler');
const Group = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');

// @desc    Get all unique branches with codes
// @route   GET /api/branches
// @access  Private
const getAllBranches = asyncHandler(async (req, res) => {
  // Prefer authoritative branch list from users to include both name and code
  // Falls back to groups if users have none (then only names will be available)
  const userBranches = await User.aggregate([
    {
      $group: {
        _id: { branchCode: '$branchCode', branchName: '$branch' },
      },
    },
    {
      $project: {
        _id: 0,
        branchCode: '$_id.branchCode',
        branchName: '$_id.branchName',
      },
    },
    { $sort: { branchName: 1 } },
  ]);

  if (userBranches && userBranches.length > 0) {
    return res.status(200).json(userBranches);
  }

  // Fallback 2: derive from expenses (has both code and name)
  const expenseBranches = await Expense.aggregate([
    {
      $group: {
        _id: { branchCode: '$branchCode', branchName: '$branchName' },
      },
    },
    {
      $project: {
        _id: 0,
        branchCode: '$_id.branchCode',
        branchName: '$_id.branchName',
      },
    },
    { $sort: { branchName: 1 } },
  ]);

  if (expenseBranches && expenseBranches.length > 0) {
    return res.status(200).json(expenseBranches);
  }

  // Fallback 3: distinct names from groups (no codes)
  const groupBranchNames = await Group.distinct('branchName');
  const fallback = groupBranchNames.map((name) => ({ branchName: name, branchCode: '' }));
  return res.status(200).json(fallback);
});

module.exports = {
  getAllBranches,
};
