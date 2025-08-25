const Loan = require('../models/Loan');

// @desc    Get financial summary
// @route   GET /api/financial-summary
// @access  Private
exports.getFinancialSummary = async (req, res) => {
  try {
    const { branchCode, startDate, endDate } = req.query;

    // Build base query for filtering
    const query = {};
    if (branchCode) {
      query.branchCode = branchCode;
    }

    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }
    if (startDate || endDate) {
      query['collections.collectionDate'] = dateFilter;
    }

    const loans = await Loan.find(query).lean();

    let totalCollected = 0;
    let totalShortage = 0;

    loans.forEach(loan => {
      if (loan.collections && loan.collections.length > 0) {
        loan.collections.forEach(collection => {
          // Apply date filtering to each collection
          const collectionDate = new Date(collection.collectionDate);
          const isAfterStart = startDate ? collectionDate >= new Date(startDate) : true;
          const isBeforeEnd = endDate ? collectionDate <= new Date(endDate) : true;

          if (isAfterStart && isBeforeEnd) {
            totalCollected += collection.fieldCollection || 0;
            const shortage = (collection.weeklyAmount || 0) - (collection.fieldCollection || 0);
            if (shortage > 0) {
              totalShortage += shortage;
            }
          }
        });
      }
    });

    // Calculate Overdue Payments
    const overdueQuery = { status: 'active' };
    if (branchCode) {
      overdueQuery.branchCode = branchCode;
    }
    overdueQuery.endingDate = { $lt: new Date() }; // Loans that should have ended by now

    const overdueLoans = await Loan.find(overdueQuery).lean();
    const totalOverdue = overdueLoans.reduce((acc, loan) => {
      const balance = (loan.loanAmount || 0) - (loan.totalRealization || 0);
      return acc + (balance > 0 ? balance : 0);
    }, 0);

    res.json({
      totalCollected,
      totalOverdue,
      totalShortage,
    });

  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
