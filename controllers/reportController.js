const AuditReport = require('../models/AuditReport');
const Group = require('../models/Group');
const Loan = require('../models/Loan');
const User = require('../models/User');

// Create a new monthly audit report
exports.createAuditReport = async (req, res) => {
  try {
    const { branchName, branchLoan, loanOfficerName, groups, auditorName, approvedBy } = req.body;
    
    const newReport = new AuditReport({
      branchName,
      branchLoan,
      loanOfficerName,
      groups,
      auditorName,
      approvedBy,
      createdBy: req.user._id
    });

    const savedReport = await newReport.save();
    res.status(201).json(savedReport);
  } catch (error) {
    res.status(500).json({ message: 'Error creating audit report', error: error.message });
  }
};

// Get all audit reports
exports.getAuditReports = async (req, res) => {
  try {
    const reports = await AuditReport.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name');
    
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit reports', error: error.message });
  }
};

// Get a single audit report by ID
exports.getAuditReportById = async (req, res) => {
  try {
    const report = await AuditReport.findById(req.params.id)
      .populate('createdBy', 'name');
    
    if (!report) {
      return res.status(404).json({ message: 'Audit report not found' });
    }
    
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit report', error: error.message });
  }
};

// Update an audit report
exports.updateAuditReport = async (req, res) => {
  try {
    const { branchName, branchLoan, loanOfficerName, groups, auditorName, approvedBy } = req.body;
    
    const updatedReport = await AuditReport.findByIdAndUpdate(
      req.params.id,
      {
        branchName,
        branchLoan,
        loanOfficerName,
        groups,
        auditorName,
        approvedBy
      },
      { new: true }
    );
    
    if (!updatedReport) {
      return res.status(404).json({ message: 'Audit report not found' });
    }
    
    res.status(200).json(updatedReport);
  } catch (error) {
    res.status(500).json({ message: 'Error updating audit report', error: error.message });
  }
};

// Delete an audit report
exports.deleteAuditReport = async (req, res) => {
  try {
    const deletedReport = await AuditReport.findByIdAndDelete(req.params.id);
    
    if (!deletedReport) {
      return res.status(404).json({ message: 'Audit report not found' });
    }
    
    res.status(200).json({ message: 'Audit report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting audit report', error: error.message });
  }
};

// Generate monthly audit report data
exports.generateMonthlyAuditReport = async (req, res) => {
  try {
    const { branchName, loanOfficerId, month, year } = req.query;
    
    // Find the loan officer
    const loanOfficer = await User.findById(loanOfficerId);
    if (!loanOfficer) {
      return res.status(404).json({ message: 'Loan officer not found' });
    }

    // Get all groups for the specified branch
    const groups = await Group.find({ branch: branchName });
    
    if (!groups || groups.length === 0) {
      return res.status(404).json({ message: 'No groups found for this branch' });
    }
    
    // Calculate the start and end date for the specified month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Prepare the report data structure
    const reportData = {
      date: new Date(),
      branchName,
      branchLoan: '', // This would need to be populated from your data
      loanOfficerName: loanOfficer.name,
      groups: []
    };

    // For each group, calculate the required metrics
    for (const group of groups) {
      // Get all loans for this group, officer, and date range
      const loans = await Loan.find({
        groupId: group._id,
        loanOfficerName: loanOfficer.name, // Filter by loan officer's name
        disbursementDate: { $gte: startDate, $lte: endDate } // Filter by date range
      });
      
      let loanLedger = 0;
      let fieldCollection = 0;
      let ledgerBalance = 0;
      let fieldBalance = 0;
      let overdue = 0;
      
      // Calculate metrics for each loan
      loans.forEach(loan => {
        loanLedger += loan.amount;
        
        // Calculate field collection (payments made)
        const paymentsInPeriod = loan.payments.filter(payment => 
          new Date(payment.date) >= startDate && new Date(payment.date) <= endDate
        );
        
        const totalCollected = paymentsInPeriod.reduce((sum, payment) => sum + payment.amount, 0);
        fieldCollection += totalCollected;
        
        // Calculate ledger balance (remaining loan amount)
        const totalPaid = loan.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const remainingBalance = loan.amount - totalPaid;
        ledgerBalance += remainingBalance;
        
        // Calculate field balance (expected collection minus actual collection)
        // This is simplified and would need to be adjusted based on your business logic
        const expectedPayment = loan.amount / loan.term * 
          Math.min(
            Math.floor((endDate - new Date(loan.disbursementDate)) / (30 * 24 * 60 * 60 * 1000)),
            loan.term
          );
        
        fieldBalance += expectedPayment - totalCollected;
        
        // Calculate overdue
        if (remainingBalance > 0 && new Date(loan.dueDate) < endDate) {
          overdue += remainingBalance;
        }
      });
      
      // Calculate shortage and overage
      const shortage = fieldBalance > 0 ? fieldBalance : 0;
      const overage = fieldBalance < 0 ? Math.abs(fieldBalance) : 0;
      
      // Add group data to the report
      reportData.groups.push({
        groupName: group.name,
        loanLedger,
        fieldCollection,
        ledgerBalance,
        fieldBalance,
        shortage,
        overage,
        overdue
      });
    }
    
    res.status(200).json(reportData);
  } catch (error) {
    res.status(500).json({ message: 'Error generating monthly audit report', error: error.message });
  }
};
