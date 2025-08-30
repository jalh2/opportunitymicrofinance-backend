const AuditReport = require('../models/AuditReport');
const Group = require('../models/Group');
const Loan = require('../models/Loan');
const Distribution = require('../models/Distribution');
const User = require('../models/User');
const SavingsAccount = require('../models/Savings');
const Expense = require('../models/Expense');

const { generateMonthlyAudit } = require('../services/reports/monthlyAudit');
const { generateOverdueBreakdown } = require('../services/reports/overdueBreakdown');
const { generateMonthlyCollectionAudit } = require('../services/reports/monthlyCollectionAudit');

// Debug logging (toggle with REPORT_DEBUG=true or REPORT_DEBUG=1)
const REPORT_DEBUG = String(process.env.REPORT_DEBUG || '').toLowerCase() === 'true' || process.env.REPORT_DEBUG === '1';
const dbg = (...args) => {
  if (REPORT_DEBUG) {
    try { console.log('[ReportController]', ...args); } catch (_) {}
  }
};

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
    dbg('generateMonthlyAuditReport:start', {
      query: { branchName, loanOfficerId, month, year },
      user: req.user ? { id: String(req.user._id || ''), email: req.user.email, branch: req.user.branch, branchCode: req.user.branchCode } : null,
    });

    if (!branchName || !month || !year) {
      return res.status(400).json({ message: 'branchName, month, and year are required' });
    }

    // Delegate to modular service (keeps controller slim and supports multiple report types)
    const data = await generateMonthlyAudit({
      branchName,
      loanOfficerId: loanOfficerId || null,
      month: Number(month),
      year: Number(year),
    });

    // If loanOfficerId was provided but not found, service throws; otherwise it returns aggregated data
    if (REPORT_DEBUG) {
      const totals = (Array.isArray(data.groups) ? data.groups : []).reduce((acc, g) => ({
        loanLedger: acc.loanLedger + (Number(g.loanLedger) || 0),
        fieldCollection: acc.fieldCollection + (Number(g.fieldCollection) || 0),
        ledgerBalance: acc.ledgerBalance + (Number(g.ledgerBalance) || 0),
        fieldBalance: acc.fieldBalance + (Number(g.fieldBalance) || 0),
        shortage: acc.shortage + (Number(g.shortage) || 0),
        overage: acc.overage + (Number(g.overage) || 0),
        overdue: acc.overdue + (Number(g.overdue) || 0),
      }), { loanLedger: 0, fieldCollection: 0, ledgerBalance: 0, fieldBalance: 0, shortage: 0, overage: 0, overdue: 0 });
      dbg('generateMonthlyAuditReport:result', {
        groupsCount: Array.isArray(data.groups) ? data.groups.length : 0,
        totals,
      });
    }
    res.status(200).json(data);
  } catch (error) {
    const msg = error && error.message ? error.message : 'Unknown error';
    dbg('generateMonthlyAuditReport:error', { message: msg });
    if (msg === 'Loan officer not found' || msg === 'No groups found for this branch') {
      return res.status(404).json({ message: msg });
    }
    res.status(500).json({ message: 'Error generating monthly audit report', error: msg });
  }
};

// Generate monthly collection audit report data
// GET /api/reports/monthly-collection-audit?branchName=...&month=...&year=...&loanOfficerId=...&currency=USD|LRD
exports.generateMonthlyCollectionAuditReport = async (req, res) => {
  try {
    const { branchName, loanOfficerId, month, year, currency } = req.query;
    const cur = currency ? String(currency).toUpperCase() : null;
    dbg('generateMonthlyCollectionAuditReport:start', {
      query: { branchName, loanOfficerId, month, year, currency: cur },
      user: req.user ? { id: String(req.user._id || ''), email: req.user.email, branch: req.user.branch, branchCode: req.user.branchCode } : null,
    });

    if (!branchName || !month || !year) {
      return res.status(400).json({ message: 'branchName, month, and year are required' });
    }

    if (cur && !['USD', 'LRD'].includes(cur)) {
      return res.status(400).json({ message: 'Invalid currency' });
    }

    const data = await generateMonthlyCollectionAudit({
      branchName,
      loanOfficerId: loanOfficerId || null,
      month: Number(month),
      year: Number(year),
      currency: cur || null,
    });

    if (REPORT_DEBUG) {
      const totals = (Array.isArray(data.groups) ? data.groups : []).reduce((acc, g) => ({
        loanAmount: acc.loanAmount + (Number(g.loanAmount) || 0),
        weeklyCollection: acc.weeklyCollection + (Number(g.weeklyCollection) || 0),
        amountCollected: acc.amountCollected + (Number(g.amountCollected) || 0),
        advancePayment: acc.advancePayment + (Number(g.advancePayment) || 0),
        fieldBalanceLoan: acc.fieldBalanceLoan + (Number(g.fieldBalanceLoan) || 0),
        overdue: acc.overdue + (Number(g.overdue) || 0),
      }), { loanAmount: 0, weeklyCollection: 0, amountCollected: 0, advancePayment: 0, fieldBalanceLoan: 0, overdue: 0 });
      dbg('generateMonthlyCollectionAuditReport:result', {
        groupsCount: Array.isArray(data.groups) ? data.groups.length : 0,
        totals,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    const msg = error && error.message ? error.message : 'Unknown error';
    dbg('generateMonthlyCollectionAuditReport:error', { message: msg });
    if (msg === 'Loan officer not found' || msg === 'No groups found for this branch') {
      return res.status(404).json({ message: msg });
    }
    return res.status(500).json({ message: 'Error generating monthly collection audit report', error: msg });
  }
};

// Generate overdue breakdown (Officer > Group > Client)
// GET /api/reports/overdue-breakdown?branchName=...&month=...&year=...&loanOfficerId=...
exports.generateOverdueBreakdownReport = async (req, res) => {
  try {
    const { branchName, loanOfficerId, month, year } = req.query;
    dbg('generateOverdueBreakdown:start', {
      query: { branchName, loanOfficerId, month, year },
      user: req.user ? { id: String(req.user._id || ''), email: req.user.email, branch: req.user.branch, branchCode: req.user.branchCode } : null,
    });

    if (!branchName || !month || !year) {
      return res.status(400).json({ message: 'branchName, month, and year are required' });
    }

    const data = await generateOverdueBreakdown({
      branchName,
      loanOfficerId: loanOfficerId || null,
      month: Number(month),
      year: Number(year),
    });

    if (REPORT_DEBUG) {
      const officers = Array.isArray(data.officers) ? data.officers.length : 0;
      const groups = Array.isArray(data.officers) ? data.officers.reduce((s, o) => s + (Array.isArray(o.groups) ? o.groups.length : 0), 0) : 0;
      const clients = Array.isArray(data.officers) ? data.officers.reduce((s, o) => s + (Array.isArray(o.groups) ? o.groups.reduce((sg, g) => sg + (Array.isArray(g.clients) ? g.clients.length : 0), 0) : 0), 0) : 0;
      dbg('generateOverdueBreakdown:result', { officers, groups, clients, totalOverdue: data.totals && data.totals.overdue });
    }

    return res.status(200).json(data);
  } catch (error) {
    const msg = error && error.message ? error.message : 'Unknown error';
    dbg('generateOverdueBreakdown:error', { message: msg });
    if (msg === 'Loan officer not found') {
      return res.status(404).json({ message: msg });
    }
    return res.status(500).json({ message: 'Error generating overdue breakdown report', error: msg });
  }
};

// Generate weekly financial report directly from loans and collections (no snapshots)
// GET /api/reports/generate-weekly-loans?branchName=...&currency=LRD&startDate=...&endDate=...
exports.generateWeeklyLoanReport = async (req, res) => {
  try {
    const { branchName, currency, startDate, endDate } = req.query;
    dbg('generateWeeklyLoanReport:start', { branchName, currency, startDate, endDate });

    if (!branchName || !startDate || !endDate) {
      return res.status(400).json({ message: 'branchName, startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }
    if (start > end) {
      return res.status(400).json({ message: 'startDate must be before endDate' });
    }

    // Build base loan query: active loans, matching branch & currency (if provided), overlapping with period
    const loanQuery = {
      status: 'active',
      branchName,
      disbursementDate: { $lte: end },
      $or: [
        { endingDate: { $exists: false } },
        { endingDate: null },
        { endingDate: { $gte: start } },
      ],
    };
    if (currency) loanQuery.currency = currency;

    const loans = await Loan.find(loanQuery)
      .populate('group', 'groupName clients')
      .select('group clients weeklyInstallment disbursementDate endingDate meetingDay branchName branchCode currency collections');

    // Helper: meeting day index mapping (0=Sunday ... 6=Saturday)
    const dayIndexMap = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    };

    // Build list of dates within [start, end]
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayKeys = [];
    for (let t = new Date(start.getFullYear(), start.getMonth(), start.getDate()); t <= end; t = new Date(t.getTime() + msPerDay)) {
      const key = t.toISOString().slice(0, 10);
      dayKeys.push(key);
    }

    const daily = {};
    dayKeys.forEach(k => { daily[k] = { date: k, expected: 0, collected: 0, shortage: 0, overage: 0, distributions: 0 }; });

    // Aggregate expected per day based on meetingDay when available; otherwise, allocate to the first day of the period the loan is active within
    let totalExpectedWeekly = 0;
    const activeLoans = [];

    for (const loan of loans) {
      const memberCount = Array.isArray(loan.clients) ? loan.clients.length
        : (loan.group && Array.isArray(loan.group.clients)) ? loan.group.clients.length : 0;
      const expectedPerWeek = Math.max(Number(loan.weeklyInstallment || 0) * memberCount, 0);

      // Check overlap with [start, end]
      const loanStart = loan.disbursementDate ? new Date(loan.disbursementDate) : start;
      const loanEnd = loan.endingDate ? new Date(loan.endingDate) : end;
      const overlaps = loanStart <= end && loanEnd >= start;
      if (!overlaps || expectedPerWeek <= 0) continue;

      totalExpectedWeekly += expectedPerWeek;
      activeLoans.push(loan._id);

      // Determine which day in the week to allocate expected
      let targetDayKey = null;
      if (loan.meetingDay && typeof loan.meetingDay === 'string') {
        const md = String(loan.meetingDay || '').toLowerCase();
        const idx = dayIndexMap[md];
        if (idx != null) {
          // Find the date within [start, end] that matches this weekday
          for (let t = new Date(start.getFullYear(), start.getMonth(), start.getDate()); t <= end; t = new Date(t.getTime() + msPerDay)) {
            if (t.getDay() === idx) {
              const activeOnDay = (!loan.disbursementDate || t >= loanStart) && (!loan.endingDate || t <= loanEnd);
              if (activeOnDay) {
                targetDayKey = t.toISOString().slice(0, 10);
                break;
              }
            }
          }
        }
      }
      if (!targetDayKey) {
        // Fallback: allocate to the first day in the period the loan is active
        for (let t = new Date(start.getFullYear(), start.getMonth(), start.getDate()); t <= end; t = new Date(t.getTime() + msPerDay)) {
          const activeOnDay = (!loan.disbursementDate || t >= loanStart) && (!loan.endingDate || t <= loanEnd);
          if (activeOnDay) {
            targetDayKey = t.toISOString().slice(0, 10);
            break;
          }
        }
      }
      if (targetDayKey && daily[targetDayKey]) {
        daily[targetDayKey].expected += expectedPerWeek;
      }
    }

    // Aggregate actual collections within [start, end]
    let totalCollectedWeekly = 0;
    for (const loan of loans) {
      if (!Array.isArray(loan.collections)) continue;
      for (const c of loan.collections) {
        if (!c || !c.collectionDate) continue;
        if (currency && c.currency && c.currency !== currency) continue; // ensure currency consistency
        const dt = new Date(c.collectionDate);
        if (dt >= start && dt <= end) {
          const key = dt.toISOString().slice(0, 10);
          const amount = Number(c.fieldCollection || 0);
          totalCollectedWeekly += amount;
          if (daily[key]) daily[key].collected += amount;
        }
      }
    }

    // Aggregate distributions within [start, end] limited to loans in scope (branch/currency)
    let distributionsTotal = 0;
    try {
      if (activeLoans.length > 0) {
        const distributions = await Distribution.find({
          loan: { $in: activeLoans },
          currency: currency || { $exists: true },
          date: { $gte: start, $lte: end },
        }).select('amount currency date');

        for (const d of distributions) {
          const key = new Date(d.date).toISOString().slice(0, 10);
          const amt = Number(d.amount || 0);
          distributionsTotal += amt;
          if (daily[key]) daily[key].distributions += amt;
        }
      }
    } catch (e) {
      dbg('generateWeeklyLoanReport:distributions:error', e && e.message ? e.message : String(e));
    }

    // Compute daily shortage/overage and totals
    let totalShortageWeekly = 0;
    let totalOverageWeekly = 0;
    const dailyRows = dayKeys.map(k => {
      const row = daily[k];
      row.shortage = Math.max(row.expected - row.collected, 0);
      row.overage = Math.max(row.collected - row.expected, 0);
      totalShortageWeekly += row.shortage;
      totalOverageWeekly += row.overage;
      return row;
    });

    const result = {
      branchName,
      currency: currency || null,
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      summary: {
        loansCount: loans.length,
        totalExpected: Math.round(totalExpectedWeekly * 100) / 100,
        totalCollected: Math.round(totalCollectedWeekly * 100) / 100,
        totalShortage: Math.round(totalShortageWeekly * 100) / 100,
        totalOverage: Math.round(totalOverageWeekly * 100) / 100,
        distributionsTotal: Math.round(distributionsTotal * 100) / 100,
      },
      daily: dailyRows,
    };

    dbg('generateWeeklyLoanReport:result', { loans: loans.length, totals: result.summary });
    return res.status(200).json(result);
  } catch (error) {
    dbg('generateWeeklyLoanReport:error', error && error.message ? error.message : String(error));
    return res.status(500).json({ message: 'Error generating weekly report', error: error.message || 'Unknown error' });
  }
};

// Generate Weekly Collection Report (branch-level aggregate across savings, loans, expenses, admissions, and disbursements)
// GET /api/reports/generate-weekly-collection?branchName=...&startDate=...&endDate=...&currency=USD|LRD
exports.generateWeeklyCollectionReport = async (req, res) => {
  try {
    const { branchName, startDate, endDate, currency } = req.query;
    const cur = currency ? String(currency).toUpperCase() : null;
    dbg('generateWeeklyCollectionReport:start', { branchName, startDate, endDate, currency: cur });

    if (!branchName || !startDate || !endDate) {
      return res.status(400).json({ message: 'branchName, startDate and endDate are required' });
    }
    if (cur && !['USD', 'LRD'].includes(cur)) {
      return res.status(400).json({ message: 'Invalid currency' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }
    if (start > end) {
      return res.status(400).json({ message: 'startDate must be before endDate' });
    }

    // Pipelines
    const savingsPipeline = [
      { $lookup: { from: 'groups', localField: 'group', foreignField: '_id', as: 'g' } },
      { $unwind: '$g' },
      { $match: Object.assign({ 'g.branchName': branchName }, cur ? { currency: cur } : {}) },
      { $group: { _id: null, total: { $sum: '$currentBalance' } } },
    ];

    const loanCollectionsPipeline = [
      { $match: { branchName } },
      { $unwind: '$collections' },
      { $match: Object.assign({ 'collections.collectionDate': { $gte: start, $lte: end } }, cur ? { 'collections.currency': cur } : {}) },
      { $group: { _id: null, total: { $sum: '$collections.fieldCollection' } } },
    ];

    const expensesPipeline = [
      { $match: Object.assign({ branchName, expenseDate: { $gte: start, $lte: end } }, cur ? { currency: cur } : {}) },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ];

    const disbursementsPipeline = [
      { $match: Object.assign({ date: { $gte: start, $lte: end } }, cur ? { currency: cur } : {}) },
      { $lookup: { from: 'groups', localField: 'group', foreignField: '_id', as: 'g' } },
      { $unwind: '$g' },
      { $match: { 'g.branchName': branchName } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ];

    // Execute in parallel (load Client dynamically to avoid redeclaration in other functions)
    const Client = require('../models/Client');
    const admissionsPipeline = [
      { $match: { admissionDate: { $gte: start, $lte: end } } },
      { $lookup: { from: 'groups', localField: 'group', foreignField: '_id', as: 'g' } },
      { $unwind: '$g' },
      { $match: { 'g.branchName': branchName } },
      { $count: 'count' },
    ];

    const [savingsAgg, loanAgg, expenseAgg, admissionsAgg, disbAgg] = await Promise.all([
      SavingsAccount.aggregate(savingsPipeline),
      Loan.aggregate(loanCollectionsPipeline),
      Expense.aggregate(expensesPipeline),
      Client.aggregate(admissionsPipeline),
      Distribution.aggregate(disbursementsPipeline),
    ]);

    const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
    const savingsBalance = round2((savingsAgg && savingsAgg[0] && savingsAgg[0].total) || 0);
    const loanCollected = round2((loanAgg && loanAgg[0] && loanAgg[0].total) || 0);
    const weeklyExpenses = round2((expenseAgg && expenseAgg[0] && expenseAgg[0].total) || 0);
    const disbursements = round2((disbAgg && disbAgg[0] && disbAgg[0].total) || 0);
    const clientsAdmitted = (admissionsAgg && admissionsAgg[0] && admissionsAgg[0].count) || 0;

    const ADMISSION_FEE_LRD = 1000; // fixed per user requirement
    const admissionFees = cur === 'LRD' || !cur ? round2(clientsAdmitted * ADMISSION_FEE_LRD) : 0;

    const result = {
      branchName,
      currency: cur || null,
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      totals: {
        savingsBalance,
        loanCollected,
        weeklyExpenses,
        admissionFees, // LRD only
        disbursements,
        goodsCollected: null, // left blank per requirement
      },
      counts: { clientsAdmitted },
    };

    dbg('generateWeeklyCollectionReport:result', { branchName, currency: cur, totals: result.totals, counts: result.counts });
    return res.status(200).json(result);
  } catch (error) {
    dbg('generateWeeklyCollectionReport:error', error && error.message ? error.message : String(error));
    return res.status(500).json({ message: 'Error generating weekly collection report', error: error.message || 'Unknown error' });
  }
};

// Generate Branch Monthly Summary (per-user metrics)
// GET /api/reports/branch-monthly-summary?branchName=...&month=...&year=...
exports.generateBranchMonthlySummary = async (req, res) => {
  try {
    const { branchName, month, year } = req.query;
    dbg('generateBranchMonthlySummary:start', { branchName, month, year });
    if (!branchName || !month || !year) {
      return res.status(400).json({ message: 'branchName, month and year are required' });
    }

    const m = Number(month), y = Number(year);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    // Load users for the branch
    const users = await User.find({ branch: branchName }).select('_id username email branch branchCode');
    const userIndexByName = new Map();
    const userIndexById = new Map();
    const rows = [];
    users.forEach((u, idx) => {
      userIndexByName.set(String(u.username || '').toLowerCase(), idx);
      userIndexById.set(String(u._id), idx);
      rows.push({
        userId: String(u._id),
        username: u.username,
        email: u.email,
        disbursed: 0,
        collected: 0,
        overdue: 0,
        shortage: 0,
        clientsRegistered: 0,
        attendance: null,
      });
    });
    const ensureIndex = (key) => {
      if (key == null) return null;
      const k = String(key).toLowerCase();
      if (userIndexByName.has(k)) return userIndexByName.get(k);
      return null; // Unknown user; skip/bucket
    };

    // Helper: count weekly occurrences between two dates for a given meetingDay (0=Sun..6=Sat)
    const countWeeklyOccurrences = (startDate, endDate, meetingDayIdx) => {
      if (meetingDayIdx == null) return 0;
      let count = 0;
      for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 24*60*60*1000)) {
        if (d.getUTCDay() === meetingDayIdx) count++;
      }
      return count;
    };
    const dayIndexMap = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };

    // Loans for this branch overlapping the month (for expected/overdue and collections)
    const loans = await Loan.find({
      branchName,
      disbursementDate: { $lte: end },
      $or: [ { endingDate: { $exists: false } }, { endingDate: null }, { endingDate: { $gte: start } } ],
    }).populate('group', 'clients').select('clients group weeklyInstallment meetingDay disbursementDate endingDate loanAmount currency status loanOfficerName collections');

    // 1) Disbursed in month
    for (const loan of loans) {
      if (loan.disbursementDate && loan.disbursementDate >= start && loan.disbursementDate <= end) {
        const idx = ensureIndex(loan.loanOfficerName);
        if (idx != null) rows[idx].disbursed += Number(loan.loanAmount || 0);
      }
    }

    // 2) Collections in month, 3) Expected/Shortage in month, 4) Overdue to date
    for (const loan of loans) {
      const memberCount = Array.isArray(loan.clients) ? loan.clients.length
        : (loan.group && Array.isArray(loan.group.clients)) ? loan.group.clients.length : 0;
      const expectedWeekly = Math.max(Number(loan.weeklyInstallment || 0) * memberCount, 0);
      const meetingIdx = loan.meetingDay ? dayIndexMap[String(loan.meetingDay).toLowerCase()] : null;

      const loanStart = loan.disbursementDate ? new Date(loan.disbursementDate) : start;
      const loanEnd = loan.endingDate ? new Date(loan.endingDate) : end;
      const activeStart = loanStart > start ? loanStart : start;
      const activeEnd = loanEnd < end ? loanEnd : end;
      if (!(activeStart <= activeEnd)) continue;

      const idx = ensureIndex(loan.loanOfficerName);
      if (idx == null) continue;

      // Collections
      let collectedInMonth = 0;
      let collectedToDate = 0;
      if (Array.isArray(loan.collections)) {
        for (const c of loan.collections) {
          if (!c || !c.collectionDate) continue;
          const dt = new Date(c.collectionDate);
          const amt = Number(c.fieldCollection || 0);
          if (dt >= start && dt <= end) collectedInMonth += amt;
          if (dt <= end) collectedToDate += amt;
        }
      }
      rows[idx].collected += collectedInMonth;

      // Expected occurrences within month for shortage
      const occInMonth = meetingIdx != null
        ? countWeeklyOccurrences(activeStart, activeEnd, meetingIdx)
        : Math.max(Math.ceil((activeEnd - activeStart + 1) / (7*24*60*60*1000)), 0);
      const expectedInMonth = expectedWeekly * occInMonth;
      const shortage = Math.max(expectedInMonth - collectedInMonth, 0);
      rows[idx].shortage += shortage;

      // Overdue to end of period
      const activeStartToEnd = loanStart <= end ? loanStart : end;
      const occToDate = meetingIdx != null
        ? countWeeklyOccurrences(activeStartToEnd, end, meetingIdx)
        : Math.max(Math.ceil((end - activeStartToEnd + 1) / (7*24*60*60*1000)), 0);
      const expectedToDate = expectedWeekly * occToDate;
      const overdue = Math.max(expectedToDate - collectedToDate, 0);
      rows[idx].overdue += overdue;
    }

    // 5) Clients registered in month per registrar
    const Client = require('../models/Client');
    const clients = await Client.find({ branchName, createdAt: { $gte: start, $lte: end } }).select('createdBy createdByEmail createdByName');
    for (const c of clients) {
      let idx = null;
      if (c.createdBy) idx = userIndexById.get(String(c.createdBy));
      if (idx == null && c.createdByName) idx = ensureIndex(c.createdByName);
      if (idx != null) rows[idx].clientsRegistered += 1;
    }

    const totals = rows.reduce((acc, r) => ({
      disbursed: acc.disbursed + r.disbursed,
      collected: acc.collected + r.collected,
      overdue: acc.overdue + r.overdue,
      shortage: acc.shortage + r.shortage,
      clientsRegistered: acc.clientsRegistered + r.clientsRegistered,
    }), { disbursed: 0, collected: 0, overdue: 0, shortage: 0, clientsRegistered: 0 });

    return res.status(200).json({
      branchName,
      period: { month: m, year: y, startDate: start.toISOString(), endDate: end.toISOString() },
      users: rows,
      totals,
    });
  } catch (error) {
    dbg('generateBranchMonthlySummary:error', error && error.message ? error.message : String(error));
    return res.status(500).json({ message: 'Error generating branch monthly summary', error: error.message || 'Unknown error' });
  }
};

// Generate Branch Monthly Shortage (per-group shortage and overdue with officer name)
// GET /api/reports/branch-monthly-shortage?branchName=...&month=...&year=...
exports.generateBranchMonthlyShortage = async (req, res) => {
  try {
    const { branchName, month, year } = req.query;
    dbg('generateBranchMonthlyShortage:start', { branchName, month, year });
    if (!branchName || !month || !year) {
      return res.status(400).json({ message: 'branchName, month and year are required' });
    }

    const m = Number(month), y = Number(year);

    // 1) Reuse monthly audit logic to compute per-group shortage and overdue
    const audit = await generateMonthlyAudit({ branchName, month: m, year: y });
    const groupsFromAudit = Array.isArray(audit.groups) ? audit.groups : [];

    // 2) Resolve officer names for groups in this branch
    const groups = await Group.find({ branchName })
      .populate('loanOfficer', 'username name email')
      .select('_id groupName loanOfficer')
      .lean();

    // Build a bulk fallback map of latest officer per group (avoids N+1 queries)
    const officerByGroupName = new Map();
    const groupIds = groups.map(g => g._id);
    let latestOfficerByGroupId = new Map();
    try {
      const latestByGroup = await Loan.aggregate([
        { $match: { group: { $in: groupIds } } },
        { $sort: { disbursementDate: -1 } },
        { $group: { _id: '$group', loanOfficerName: { $first: '$loanOfficerName' }, disbursementDate: { $first: '$disbursementDate' } } },
      ]);
      latestOfficerByGroupId = new Map(latestByGroup.map(doc => [String(doc._id), doc.loanOfficerName]));
    } catch (_) { /* noop */ }

    for (const g of groups) {
      let officerName = '';
      if (g.loanOfficer) {
        officerName = g.loanOfficer.username || g.loanOfficer.name || g.loanOfficer.email || '';
      } else {
        officerName = latestOfficerByGroupId.get(String(g._id)) || '';
      }
      officerByGroupName.set(String(g.groupName), officerName);
    }

    // 3) Build rows with totals
    const rows = groupsFromAudit.map(g => ({
      groupName: g.groupName || '',
      loanOfficerName: officerByGroupName.get(String(g.groupName)) || '',
      shortage: Number(g.shortage || 0),
      overdue: Number(g.overdue || 0),
    }));

    const totals = rows.reduce((acc, r) => ({
      shortage: acc.shortage + (Number.isFinite(r.shortage) ? r.shortage : 0),
      overdue: acc.overdue + (Number.isFinite(r.overdue) ? r.overdue : 0),
    }), { shortage: 0, overdue: 0 });

    // 4) Respond
    return res.status(200).json({
      branchName,
      period: { month: m, year: y },
      rows,
      totals,
    });
  } catch (error) {
    dbg('generateBranchMonthlyShortage:error', error && error.message ? error.message : String(error));
    return res.status(500).json({ message: 'Error generating branch monthly shortage', error: error.message || 'Unknown error' });
  }
};
