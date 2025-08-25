const Expense = require('../models/Expense');
const User = require('../models/User');

// Create a new expense
exports.createExpense = async (req, res) => {
  try {
    const expense = new Expense({
      ...req.body,
      recordedBy: req.user?.id || req.body.recordedBy
    });

    await expense.save();
    await expense.populate('recordedBy approvedBy', 'name email');
    
    res.status(201).json(expense);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error creating expense', error: error.message });
  }
};

// Get all expenses with filtering and pagination
exports.getAllExpenses = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      branchCode, 
      category, 
      status, 
      startDate, 
      endDate,
      currency 
    } = req.query;

    const filter = {};
    
    if (branchCode) filter.branchCode = branchCode;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (currency) filter.currency = currency;
    
    if (startDate || endDate) {
      filter.expenseDate = {};
      if (startDate) filter.expenseDate.$gte = new Date(startDate);
      if (endDate) filter.expenseDate.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(filter)
      .populate('recordedBy approvedBy', 'name email')
      .sort({ expenseDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(filter);

    res.json({
      expenses,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Error fetching expenses', error: error.message });
  }
};

// Get expense by ID
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('recordedBy approvedBy', 'name email');
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json(expense);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Error fetching expense', error: error.message });
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'name email');

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error updating expense', error: error.message });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Error deleting expense', error: error.message });
  }
};

// Approve/Reject expense
exports.updateExpenseStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['pending', 'approved', 'rejected', 'paid'];
    
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const updateData = { 
      status, 
      updatedAt: Date.now() 
    };

    if (status === 'approved' && req.user?.id) {
      updateData.approvedBy = req.user.id;
    }

    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('recordedBy approvedBy', 'name email');

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error updating expense status', error: error.message });
  }
};

// Get expense analytics/reports
exports.getExpenseAnalytics = async (req, res) => {
  try {
    const { 
      period = 'month', // day, week, month, year
      branchCode,
      startDate,
      endDate 
    } = req.query;

    // Set date range based on period
    let dateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = {
        expenseDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else {
      switch (period) {
        case 'day':
          dateFilter = {
            expenseDate: {
              $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            }
          };
          break;
        case 'week':
          const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          dateFilter = {
            expenseDate: {
              $gte: weekStart,
              $lt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
            }
          };
          break;
        case 'month':
          dateFilter = {
            expenseDate: {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1),
              $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
            }
          };
          break;
        case 'year':
          dateFilter = {
            expenseDate: {
              $gte: new Date(now.getFullYear(), 0, 1),
              $lt: new Date(now.getFullYear() + 1, 0, 1)
            }
          };
          break;
      }
    }

    const matchFilter = { ...dateFilter };
    if (branchCode) matchFilter.branchCode = branchCode;

    // Aggregate expenses by category
    const categoryBreakdown = await Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          currency: { $first: '$currency' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Aggregate expenses by branch
    const branchBreakdown = await Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { branchCode: '$branchCode', branchName: '$branchName' },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Aggregate expenses by status
    const statusBreakdown = await Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Total expenses
    const totalExpenses = await Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Daily trend for the period
    const dailyTrend = await Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            year: { $year: '$expenseDate' },
            month: { $month: '$expenseDate' },
            day: { $dayOfMonth: '$expenseDate' }
          },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({
      period,
      dateRange: dateFilter,
      summary: {
        totalAmount: totalExpenses[0]?.totalAmount || 0,
        totalCount: totalExpenses[0]?.count || 0
      },
      categoryBreakdown,
      branchBreakdown,
      statusBreakdown,
      dailyTrend
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Error fetching expense analytics', error: error.message });
  }
};
