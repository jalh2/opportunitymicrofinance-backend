const mongoose = require('mongoose');
const User = require('../../models/User');
const Group = require('../../models/Group');
const Loan = require('../../models/Loan');

// Debug logging (toggle with REPORT_DEBUG=true or REPORT_DEBUG=1)
const REPORT_DEBUG = String(process.env.REPORT_DEBUG || '').toLowerCase() === 'true' || process.env.REPORT_DEBUG === '1';
const dbg = (...args) => {
  if (REPORT_DEBUG) {
    try { console.log('[MonthlyCollectionAudit]', ...args); } catch (_) {}
  }
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getMonthRange(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

function weeksBetween(effectiveStart, effectiveEnd) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = effectiveEnd.getTime() - effectiveStart.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / msPerWeek) + 1;
}

// Core generator for Monthly Collection Audit Report
// Params: { branchName, loanOfficerId, month, year, currency }
async function generateMonthlyCollectionAudit({ branchName, loanOfficerId, month, year, currency }) {
  if (!branchName) throw new Error('branchName is required');
  if (!month || !year) throw new Error('month and year are required');
  const { startDate, endDate } = getMonthRange(year, month);
  if (currency && !['USD', 'LRD'].includes(currency)) {
    throw new Error('Invalid currency');
  }
  dbg('params', { branchName, loanOfficerId, month, year, currency, startDate, endDate });

  // Resolve officer filter (optional)
  let officerName = null;
  if (loanOfficerId && mongoose.Types.ObjectId.isValid(loanOfficerId)) {
    const officer = await User.findById(loanOfficerId).select('username name email');
    if (!officer) throw new Error('Loan officer not found');
    officerName = officer.username || officer.name || officer.email;
    dbg('resolvedOfficer', { loanOfficerId, officerName });
  }

  // Fetch groups in branch
  const groups = await Group.find({ branchName }).select('_id groupName').lean();
  if (!groups || groups.length === 0) throw new Error('No groups found for this branch');
  dbg('groupsFetched', { count: groups.length });

  const report = {
    date: new Date(),
    branchName,
    branchLoan: '',
    loanOfficerName: officerName || '',
    groups: [],
  };

  for (const g of groups) {
    const loanLedgerQuery = {
      group: g._id,
      disbursementDate: { $gte: startDate, $lte: endDate },
    };
    if (officerName) loanLedgerQuery.loanOfficerName = officerName;
    if (currency) loanLedgerQuery.currency = currency;

    const allLoansQuery = { group: g._id, disbursementDate: { $lte: endDate } };
    if (officerName) allLoansQuery.loanOfficerName = officerName;
    if (currency) allLoansQuery.currency = currency;

    const [loansForLedger, loansAll] = await Promise.all([
      Loan.find(loanLedgerQuery).select('loanAmount currency').lean(),
      Loan.find(allLoansQuery)
        .select('loanAmount weeklyInstallment disbursementDate endingDate currency collections.fieldCollection collections.advancePayment collections.collectionDate collections.currency')
        .lean(),
    ]);

    const loanAmount = (loansForLedger || []).reduce((s, l) => s + num(l.loanAmount), 0);

    let weeklyCollection = 0; // per-week expected amount for active loans during the period
    let amountCollected = 0; // fieldCollection within the month
    let advancePayment = 0; // advancePayment within the month
    let expectedInPeriod = 0; // scheduled amount within the month
    let overdue = 0; // schedule-based overdue to end of period

    for (const loan of (loansAll || [])) {
      const disbDate = loan.disbursementDate ? new Date(loan.disbursementDate) : null;
      const endCap = loan.endingDate ? new Date(loan.endingDate) : endDate;
      const collections = Array.isArray(loan.collections) ? loan.collections : [];
      // Per-loan weekly expected
      const weeklyBase = num(loan.weeklyInstallment);
      const weeklyTotal = weeklyBase;

      // Collections within month
      const inPeriodCollections = collections.filter(c => {
        if (!c || !c.collectionDate) return false;
        const dt = new Date(c.collectionDate);
        if (currency && c.currency && c.currency !== currency) return false;
        return dt >= startDate && dt <= endDate;
      });
      const collectedThisPeriod = inPeriodCollections.reduce((s, c) => s + num(c.fieldCollection), 0);
      const advanceThisPeriod = inPeriodCollections.reduce((s, c) => s + num(c.advancePayment), 0);
      amountCollected += collectedThisPeriod;
      advancePayment += advanceThisPeriod;

      // Expected within the period (cap schedule by endingDate)
      if (weeklyTotal > 0 && disbDate) {
        const effectiveStart = disbDate > startDate ? disbDate : startDate;
        const effectiveEnd = endCap < endDate ? endCap : endDate;
        if (effectiveStart <= effectiveEnd) {
          const occurrences = weeksBetween(effectiveStart, effectiveEnd);
          expectedInPeriod += occurrences * weeklyTotal;
          // If loan is active for at least one occurrence in the month, include its weeklyTotal in weeklyCollection
          if (occurrences > 0) weeklyCollection += weeklyTotal;
        }

        // Overdue to end of period (capped by endingDate)
        const overdueEnd = endCap < endDate ? endCap : endDate;
        if (disbDate <= overdueEnd) {
          const occToDate = weeksBetween(disbDate, overdueEnd);
          const expectedToDate = occToDate * weeklyTotal;
          const collectedToDate = collections
            .filter(c => {
              if (!c || !c.collectionDate) return false;
              if (currency && c.currency && c.currency !== currency) return false;
              return new Date(c.collectionDate) <= endDate;
            })
            .reduce((s, c) => s + num(c.fieldCollection), 0);
          overdue += Math.max(expectedToDate - collectedToDate, 0);
        }
      }
    }

    const fieldBalanceLoan = expectedInPeriod - amountCollected; // shortage if > 0, overage if < 0

    report.groups.push({
      groupName: g.groupName,
      loanAmount,
      weeklyCollection,
      amountCollected,
      advancePayment,
      fieldBalanceLoan,
      overdue,
    });
  }

  dbg('reportComplete', { groups: report.groups.length });
  return { ...report, currency: currency || null };
}

module.exports = { generateMonthlyCollectionAudit };
