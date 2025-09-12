const { recordMany } = require('../utils/metrics');

// Helper to coerce number safely
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDay(d) {
  const dt = d ? new Date(d) : new Date();
  dt.setHours(0, 0, 0, 0);
  return dt;
}

// Map snapshot increment keys to metric names (rename where appropriate)
function mapMetricKey(key) {
  const mapping = {
    totalProfit: 'profit',
    totalAdmissionFees: 'admissionFees',
    totalInterestCollected: 'interestCollected',
    totalFeesCollected: 'feesCollected',
    totalCollected: 'totalCollected', // principal portion
    totalWaitingToBeCollected: 'waitingToBeCollected',
    totalOverdue: 'overdue',
    totalExpenses: 'expenses',
    totalSavingsBalance: 'savingsBalance',
    totalPersonalSavingsBalance: 'personalSavingsBalance',
    totalSecuritySavingsBalance: 'securitySavingsBalance',
    totalPersonalSavingsFlow: 'personalSavingsFlow',
    totalSecurityDepositsFlow: 'securityDepositsFlow',
    totalSavingsDeposits: 'savingsDeposits',
    totalSavingsWithdrawals: 'savingsWithdrawals',
    totalLoansCount: 'loansCount',
    totalLoanAmountDistributed: 'loanAmountDistributed',
    totalAppraisalFees: 'appraisalFees',
    totalPendingLoanAmount: 'pendingLoanAmount',
    loanOfficerShortage: 'loanOfficerShortage',
    branchShortage: 'branchShortage',
    entityShortage: 'entityShortage',
    badDebt: 'badDebt',
    bankDepositSaving: 'bankDepositSaving',
  };
  return mapping[key] || key;
}

async function incrementMetrics({
  branchName = '',
  branchCode = '',
  currency = 'LRD',
  date = new Date(),
  inc = {},
  // audit/context
  group = null,
  groupName = '',
  groupCode = '',
  updatedBy = null,
  updatedByName = '',
  updatedByEmail = '',
  updateSource = '',
  loan = null,
  client = null,
  loanOfficerName = '',
}) {
  const entries = [];
  const when = date || new Date();
  for (const [k, v] of Object.entries(inc || {})) {
    const val = num(v);
    if (!val) continue;
    entries.push({
      metric: mapMetricKey(k),
      value: val,
      date: when,
      branchName,
      branchCode,
      loanOfficerName,
      currency,
      loan,
      group,
      client,
      extra: updateSource ? { updateSource, groupName, groupCode, updatedBy, updatedByName, updatedByEmail } : { groupName, groupCode, updatedBy, updatedByName, updatedByEmail },
    });
  }
  if (entries.length === 0) return [];
  return recordMany(entries);
}

// Record metrics for loan approval/disbursement
async function incrementForLoanApproval({ loan, date = new Date(), user = null, groupInfo = null, updateSource = 'loanApproval' }) {
  if (!loan) return null;
  const principal = num(loan.loanAmount || 0);
  const when = loan.disbursementDate ? new Date(loan.disbursementDate) : date;
  const group = (groupInfo && (groupInfo.group || groupInfo.groupId)) || loan.group || null;
  const groupName = (groupInfo && groupInfo.groupName) || '';
  const groupCode = (groupInfo && groupInfo.groupCode) || '';

  const inc = { totalLoansCount: 1, totalPendingLoanAmount: -1 * principal, totalLoanAmountDistributed: principal };
  return incrementMetrics({
    branchName: loan.branchName || '',
    branchCode: loan.branchCode || '',
    currency: loan.currency || 'LRD',
    date: when,
    inc,
    group,
    groupName,
    groupCode,
    updatedBy: user && user.id ? user.id : null,
    updatedByName: user && user.username ? user.username : '',
    updatedByEmail: user && user.email ? user.email : '',
    updateSource,
    loan: loan._id || null,
    client: loan.client || null,
    loanOfficerName: loan.loanOfficerName || (user && user.username) || '',
  });
}

// Record metrics for a collection entry
async function incrementForCollection({ loan, entry, user = null, groupInfo = null, updateSource = 'loanCollection' }) {
  if (!loan || !entry) return null;
  const interest = num(entry.interestPortion || 0);
  const fees = num(entry.feesPortion || 0);
  const principal = num(entry.principalPortion || 0);
  const waitingDelta = -1 * (principal + interest);
  const profit = interest + fees;

  // Arrears based on expected vs paid
  const expectedWeekly = num(entry.weeklyAmount || loan.weeklyInstallment || 0);
  const paidThisEntry = num(entry.fieldCollection || 0) + num(entry.advancePayment || 0);
  const arrearsDelta = Math.round((expectedWeekly - paidThisEntry) * 100) / 100; // positive increases overdue

  // Post-endingDate overdue reduction for catch-up principal after schedule end
  let overdueDelta = 0;
  try {
    const endDate = loan.endingDate ? new Date(loan.endingDate) : null;
    const collDate = entry.collectionDate ? new Date(entry.collectionDate) : new Date();
    if (endDate && collDate > endDate && loan.status === 'active') {
      const colls = Array.isArray(loan.collections) ? loan.collections : [];
      const sumIncluding = colls.reduce((acc, c) => {
        if (!c || !c.collectionDate) return acc;
        const cDate = new Date(c.collectionDate);
        if (cDate <= collDate) return acc + num(c.fieldCollection || 0);
        return acc;
      }, 0);
      const sumBefore = Math.max(sumIncluding - num(entry.fieldCollection || 0), 0);
      const principalOnly = num(loan.loanAmount || 0);
      const outstandingBefore = Math.max(principalOnly - sumBefore, 0);
      const outstandingAfter = Math.max(principalOnly - sumIncluding, 0);
      const decrease = Math.max(outstandingBefore - outstandingAfter, 0);
      overdueDelta = -1 * decrease;
    }
  } catch (_) {}

  const inc = {
    totalInterestCollected: interest,
    totalFeesCollected: fees,
    totalCollected: principal,
    totalWaitingToBeCollected: waitingDelta,
    totalProfit: profit,
  };
  if (arrearsDelta) inc.totalOverdue = (inc.totalOverdue || 0) + arrearsDelta;
  if (overdueDelta) inc.totalOverdue = (inc.totalOverdue || 0) + overdueDelta;

  const group = (groupInfo && (groupInfo.group || groupInfo.groupId)) || loan.group || null;
  const groupName = (groupInfo && groupInfo.groupName) || '';
  const groupCode = (groupInfo && groupInfo.groupCode) || '';

  return incrementMetrics({
    branchName: loan.branchName || '',
    branchCode: loan.branchCode || '',
    currency: loan.currency || 'LRD',
    date: entry.collectionDate || new Date(),
    inc,
    group,
    groupName,
    groupCode,
    updatedBy: user && user.id ? user.id : null,
    updatedByName: user && user.username ? user.username : '',
    updatedByEmail: user && user.email ? user.email : '',
    updateSource,
    loan: loan._id || null,
    client: loan.client || null,
    loanOfficerName: loan.loanOfficerName || (user && user.username) || '',
  });
}

module.exports = {
  incrementMetrics,
  incrementForLoanApproval,
  incrementForCollection,
};
