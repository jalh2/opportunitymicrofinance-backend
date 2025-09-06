const mongoose = require('mongoose');
const User = require('../../models/User');
const Group = require('../../models/Group');
const Loan = require('../../models/Loan');
// Debug logging (toggle with REPORT_DEBUG=true or REPORT_DEBUG=1)
const REPORT_DEBUG = String(process.env.REPORT_DEBUG || '').toLowerCase() === 'true' || process.env.REPORT_DEBUG === '1';
const dbg = (...args) => {
  if (REPORT_DEBUG) {
    try { console.log('[MonthlyAudit]', ...args); } catch (_) {}
  }
};

// Helper: clamp number to finite
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Helper: compute month range [start, end]
function getMonthRange(year, month) {
  // month is 1-12
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

// Helper: weeks between two dates (approx, inclusive weeks)
function weeksBetween(effectiveStart, endDate) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = endDate.getTime() - effectiveStart.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / msPerWeek) + 1;
}

// Core generator for Monthly Audit Report, organized for reuse
// Params: { branchName, loanOfficerId, month, year }
async function generateMonthlyAudit({ branchName, loanOfficerId, month, year }) {
  if (!branchName) {
    throw new Error('branchName is required');
  }
  if (!month || !year) {
    throw new Error('month and year are required');
  }
  dbg('params', { branchName, loanOfficerId, month, year });
  const { startDate, endDate } = getMonthRange(year, month);
  dbg('monthRange', { startDate, endDate });

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
  if (!groups || groups.length === 0) {
    throw new Error('No groups found for this branch');
  }
  dbg('groupsFetched', { branchName, count: groups.length, groups: groups.map(g => ({ id: String(g._id), groupName: g.groupName })) });

  const report = {
    date: new Date(),
    branchName,
    branchLoan: '', // can be populated later from a separate source if needed
    loanOfficerName: officerName || '',
    groups: [],
  };

  // For each group, compute metrics using loans and collections in the selected period
  for (const g of groups) {
    // Queries per spec:
    // - loanLedger: sum of principal for loans disbursed in the month
    // - fieldCollection: sum of field collections in the month across ALL loans in the group
    // - fieldBalance: expected (schedule) in month minus collected in month
    // - ledgerBalance: loanLedger - fieldCollection (period net)
    // - overdue: schedule-based cumulative expected to date (capped by endingDate) minus collected to date
    const loanLedgerQuery = {
      group: g._id,
      disbursementDate: { $gte: startDate, $lte: endDate },
    };
    if (officerName) loanLedgerQuery.loanOfficerName = officerName;

    const allLoansQuery = { group: g._id, disbursementDate: { $lte: endDate } };
    if (officerName) allLoansQuery.loanOfficerName = officerName;

    dbg('groupStart', { groupId: String(g._id), groupName: g.groupName, loanLedgerQuery, allLoansQuery });

    const tStart = Date.now();
    const [loansForLedger, loansAll] = await Promise.all([
      Loan.find(loanLedgerQuery).select('loanAmount').lean(),
      Loan.find(allLoansQuery)
        .select('loanAmount weeklyInstallment disbursementDate endingDate collections.fieldCollection collections.collectionDate')
        .lean(),
    ]);

    dbg('loansFetchedForGroup', {
      group: g.groupName,
      loansForLedgerCount: (loansForLedger || []).length,
      loansAllCount: (loansAll || []).length,
    });
    if (REPORT_DEBUG && (!loansAll || loansAll.length === 0)) {
      const recent = await Loan.find({ group: g._id })
        .select('loanOfficerName disbursementDate endingDate loanAmount weeklyInstallment collections')
        .sort({ disbursementDate: -1 })
        .limit(3)
        .lean();
      dbg('diagnosticRecentLoansAllEmpty', {
        groupName: g.groupName,
        recent: recent.map(r => ({
          disbursementDate: r.disbursementDate,
          endingDate: r.endingDate,
          loanOfficerName: r.loanOfficerName,
          loanAmount: r.loanAmount,
          weeklyInstallment: r.weeklyInstallment,
          collectionsCount: Array.isArray(r.collections) ? r.collections.length : 0,
        })),
      });
    }
    if (REPORT_DEBUG && (!loansForLedger || loansForLedger.length === 0)) {
      const recentLedger = await Loan.find({ group: g._id })
        .select('loanOfficerName disbursementDate loanAmount')
        .sort({ disbursementDate: -1 })
        .limit(3)
        .lean();
      dbg('diagnosticLoansForLedgerEmpty', {
        groupName: g.groupName,
        recent: recentLedger.map(r => ({
          disbursementDate: r.disbursementDate,
          loanOfficerName: r.loanOfficerName,
          loanAmount: r.loanAmount,
        })),
      });
    }

    const loanLedger = (loansForLedger || []).reduce((s, l) => s + num(l.loanAmount), 0);
    let fieldCollection = 0; // total collected within the month across all loans
    let expectedInPeriod = 0; // scheduled amount within the month across all loans
    let overdue = 0; // cumulative expected to date minus collected to date (capped by endingDate)

    for (const loan of (loansAll || [])) {
      const principal = num(loan.loanAmount);
      const disbDate = loan.disbursementDate ? new Date(loan.disbursementDate) : null;
      const endCap = loan.endingDate ? new Date(loan.endingDate) : endDate;
      const collections = Array.isArray(loan.collections) ? loan.collections : [];
      // Per-loan weekly expected
      const weeklyBase = num(loan.weeklyInstallment);
      const weeklyTotal = weeklyBase; // total expected per week for the loan
      // meetingDay alignment intentionally not used in monthly audit

      // Collections within the period
      const inPeriodCollections = collections.filter(c => c && c.collectionDate && new Date(c.collectionDate) >= startDate && new Date(c.collectionDate) <= endDate);
      const collectedThisPeriod = inPeriodCollections.reduce((s, c) => s + num(c.fieldCollection), 0);
      dbg('loanCollectionsInPeriod', {
        group: g.groupName,
        loanId: loan._id ? String(loan._id) : undefined,
        inPeriodCount: inPeriodCollections.length,
        collectedThisPeriod,
      });
      fieldCollection += collectedThisPeriod;

      // Expected within the period (cap schedule by endingDate)
      if (weeklyTotal > 0 && disbDate) {
        const effectiveStart = disbDate > startDate ? disbDate : startDate;
        const effectiveEnd = endCap < endDate ? endCap : endDate;
        if (effectiveStart <= effectiveEnd) {
          const occurrences = weeksBetween(effectiveStart, effectiveEnd);
          expectedInPeriod += occurrences * weeklyTotal;
          dbg('loanCalcPeriod', {
            group: g.groupName,
            loanId: loan._id ? String(loan._id) : undefined,
            weeklyBase,
            occurrences,
            expectedInPeriodDelta: occurrences * weeklyTotal,
            collectedThisPeriod,
          });
        }
      } else {
        dbg('skipExpected', {
          group: g.groupName,
          loanId: loan._id ? String(loan._id) : undefined,
          reason: weeklyTotal <= 0 ? 'weeklyTotal<=0' : (!disbDate ? 'no disbursementDate' : 'other'),
          weeklyBase,
          weeklyTotal,
          hasDisbursementDate: Boolean(disbDate),
        });
      }

      // Overdue (schedule-based): cumulative expected up to end of period (capped by endingDate) minus cumulative collected to date
      if (weeklyTotal > 0 && disbDate) {
        const overdueEnd = endCap < endDate ? endCap : endDate;
        if (disbDate <= overdueEnd) {
          const occToDate = weeksBetween(disbDate, overdueEnd);
          const expectedToDate = occToDate * weeklyTotal;
          const collectedToDate = collections
            .filter(c => c && c.collectionDate && new Date(c.collectionDate) <= endDate)
            .reduce((s, c) => s + num(c.fieldCollection), 0);
          const overdueDelta = Math.max(expectedToDate - collectedToDate, 0);
          overdue += overdueDelta;
          dbg('loanCalcOverdue', {
            group: g.groupName,
            loanId: loan._id ? String(loan._id) : undefined,
            occurrencesToDate: occToDate,
            expectedToDate,
            collectedToDate,
            overdueDelta,
          });
        }
      }
    }

    const fieldBalance = expectedInPeriod - fieldCollection; // may be negative => overage
    const shortage = fieldBalance > 0 ? fieldBalance : 0;
    const overage = fieldBalance < 0 ? Math.abs(fieldBalance) : 0;
    const ledgerBalance = loanLedger - fieldCollection; // per spec (period net)

    dbg('groupTotals', { group: g.groupName, loanLedger, fieldCollection, ledgerBalance, fieldBalance, shortage, overage, overdue, elapsedMs: Date.now() - tStart });

    report.groups.push({
      groupName: g.groupName,
      loanLedger,
      fieldCollection,
      ledgerBalance,
      fieldBalance,
      shortage,
      overage,
      overdue,
    });
  }
  dbg('reportSummary', { branchName, officerName, groupsCount: report.groups.length });
  return report;
}

module.exports = {
  generateMonthlyAudit,
};
