const mongoose = require('mongoose');
const User = require('../../models/User');
const Loan = require('../../models/Loan');

// Debug logging (toggle with REPORT_DEBUG=true or REPORT_DEBUG=1)
const REPORT_DEBUG = String(process.env.REPORT_DEBUG || '').toLowerCase() === 'true' || process.env.REPORT_DEBUG === '1';
const dbg = (...args) => {
  if (REPORT_DEBUG) {
    try { console.log('[OverdueBreakdown]', ...args); } catch (_) {}
  }
};

// Helper: safe number
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Helper: compute month range [start, end]
function getMonthRange(year, month) {
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

/**
 * Generate per-member overdue breakdown grouped by Loan Officer > Group > Client
 * Params: { branchName, loanOfficerId?, month, year }
 * Overdue semantics follow monthly audit: schedule-based cumulative expected up to end of month (capped by loan.endingDate) minus cumulative collected to date.
 */
async function generateOverdueBreakdown({ branchName, loanOfficerId, month, year }) {
  if (!branchName) throw new Error('branchName is required');
  if (!month || !year) throw new Error('month and year are required');

  const { startDate, endDate } = getMonthRange(Number(year), Number(month));
  dbg('params', { branchName, loanOfficerId, month, year, startDate, endDate });
  let queryMs = 0;

  // Resolve officer filter (optional) to officer.username/name/email as stored in Loan.loanOfficerName
  let officerName = null;
  if (loanOfficerId && mongoose.Types.ObjectId.isValid(loanOfficerId)) {
    const officer = await User.findById(loanOfficerId).select('username name email');
    if (!officer) throw new Error('Loan officer not found');
    officerName = officer.username || officer.name || officer.email;
  }

  // Load loans for branch overlapping period end (disbursed on/before endDate).
  const loanQuery = {
    branchName,
    status: { $in: ['active', 'pending'] },
    // Loans active during the selected month: disbursed on/before endDate and (no endingDate OR endingDate on/after startDate)
    disbursementDate: { $lte: endDate },
    $or: [
      { endingDate: { $exists: false } },
      { endingDate: { $gte: startDate } },
    ],
  };
  if (officerName) loanQuery.loanOfficerName = officerName;

  const t0 = Date.now();
  const loans = await Loan.find(loanQuery)
    .populate('group', 'groupName')
    .populate('client', 'memberName')
    .select('group client weeklyInstallment disbursementDate collectionStartDate endingDate loanOfficerName collections')
    .maxTimeMS(30000)
    .lean();
  queryMs = Date.now() - t0;

  dbg('loansFetched', { count: loans.length, ms: queryMs });

  // Build hierarchy: Officer -> Group -> Clients
  const officersMap = new Map();
  let grandTotalOverdue = 0;
  const buildStart = Date.now();

  for (const loan of loans) {
    const officer = String(loan.loanOfficerName || '').trim() || 'Unknown Officer';
    const groupId = loan.group ? String(loan.group._id) : undefined;
    const groupName = (loan.group && loan.group.groupName) ? loan.group.groupName : 'Unknown Group';

    if (!officersMap.has(officer)) {
      officersMap.set(officer, { loanOfficerName: officer, groups: new Map(), totals: { overdue: 0 } });
    }
    const officerEntry = officersMap.get(officer);

    if (!officerEntry.groups.has(groupName)) {
      officerEntry.groups.set(groupName, { groupId, groupName, clients: new Map(), totals: { overdue: 0 } });
    }
    const groupEntry = officerEntry.groups.get(groupName);

    // Per-loan constants
    const disbDate = loan.disbursementDate ? new Date(loan.disbursementDate) : null;
    const collStart = loan.collectionStartDate ? new Date(loan.collectionStartDate) : null;
    const effectiveStart = collStart || disbDate;
    const endCap = loan.endingDate ? new Date(loan.endingDate) : endDate;
    const overdueEnd = endCap < endDate ? endCap : endDate;
    const weeklyPerLoan = num(loan.weeklyInstallment);
    const collections = Array.isArray(loan.collections) ? loan.collections : [];

    const memberId = loan.client && loan.client._id ? String(loan.client._id) : undefined;
    const memberName = (loan.client && loan.client.memberName) ? loan.client.memberName : 'Unknown Member';
    if (!groupEntry.clients.has(memberName)) {
      groupEntry.clients.set(memberName, { memberId, memberName, expectedToDate: 0, collectedToDate: 0, overdue: 0 });
    }
    const clientRow = groupEntry.clients.get(memberName);

    let expectedToDate = 0;
    if (weeklyPerLoan > 0 && effectiveStart && effectiveStart <= overdueEnd) {
      const occToDate = weeksBetween(effectiveStart, overdueEnd);
      expectedToDate = occToDate * weeklyPerLoan;
    }
    const collectedToDate = collections
      .filter(c => c && c.collectionDate && new Date(c.collectionDate) <= endDate)
      .reduce((s, c) => s + num(c.fieldCollection), 0);
    const overdue = Math.max(expectedToDate - collectedToDate, 0);

    // Accumulate into client (in case multiple loans per member under same group/officer)
    clientRow.expectedToDate += expectedToDate;
    clientRow.collectedToDate += collectedToDate;
    clientRow.overdue += overdue;

    // Totals
    groupEntry.totals.overdue += overdue;
    officerEntry.totals.overdue += overdue;
    grandTotalOverdue += overdue;
  }

  const buildMs = Date.now() - buildStart;

  // Materialize maps into arrays and sort by names
  const sortStart = Date.now();
  const officers = Array.from(officersMap.values()).map(off => {
    const groups = Array.from(off.groups.values()).map(grp => {
      const clients = Array.from(grp.clients.values()).sort((a, b) => a.memberName.localeCompare(b.memberName));
      return {
        groupId: grp.groupId,
        groupName: grp.groupName,
        clients,
        totals: { overdue: Math.round(grp.totals.overdue * 100) / 100 },
      };
    }).sort((a, b) => a.groupName.localeCompare(b.groupName));
    return {
      loanOfficerName: off.loanOfficerName,
      groups,
      totals: { overdue: Math.round(off.totals.overdue * 100) / 100 },
    };
  }).sort((a, b) => a.loanOfficerName.localeCompare(b.loanOfficerName));
  const sortMs = Date.now() - sortStart;

  const result = {
    branchName,
    period: { month: Number(month), year: Number(year), startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    loanOfficerName: officerName || '',
    officers,
    totals: { overdue: Math.round(grandTotalOverdue * 100) / 100 },
  };

  dbg('resultSummary', {
    officers: officers.length,
    groups: officers.reduce((s, o) => s + o.groups.length, 0),
    clients: officers.reduce((s, o) => s + o.groups.reduce((sg, g) => sg + g.clients.length, 0), 0),
    totalOverdue: result.totals.overdue,
    timings: { queryMs, buildMs, sortMs },
  });

  return result;
}

module.exports = { generateOverdueBreakdown };
