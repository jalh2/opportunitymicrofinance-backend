const mongoose = require('mongoose');
const FinancialSnapshot = require('../models/FinancialSnapshot');
const BranchRegistry = require('../models/BranchRegistry');
const FIXED_SNAPSHOT_ID = process.env.FIXED_SNAPSHOT_ID;

function toDateKey(d) {
  const iso = new Date(d).toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD
}

function dayBounds(date) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  const key = toDateKey(start);
  return { start, end, key };
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
}) {
  const { start, end, key } = dayBounds(date);
  const $inc = {};
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  try {
    console.log('[SNAPSHOT] incrementMetrics request', {
      branchName: branchName || '',
      branchCode: branchCode || '',
      currency,
      dateKey: key,
      inc,
      audit: {
        group: group ? String(group) : null,
        groupName: groupName || null,
        groupCode: groupCode || null,
        updatedBy: updatedBy ? String(updatedBy) : null,
        updatedByName: updatedByName || null,
        updatedByEmail: updatedByEmail || null,
        updateSource: updateSource || null,
      }
    });
  } catch (_) {}

  if (inc.totalProfit) $inc['metrics.totalProfit'] = safe(inc.totalProfit);
  if (inc.totalAdmissionFees) $inc['metrics.totalAdmissionFees'] = safe(inc.totalAdmissionFees);
  if (inc.totalSavingsDeposits) $inc['metrics.totalSavingsDeposits'] = safe(inc.totalSavingsDeposits);
  if (inc.totalSavingsWithdrawals) $inc['metrics.totalSavingsWithdrawals'] = safe(inc.totalSavingsWithdrawals);
  if (inc.netSavingsFlow) $inc['metrics.netSavingsFlow'] = safe(inc.netSavingsFlow);
  if (inc.totalSecurityDepositsFlow) $inc['metrics.totalSecurityDepositsFlow'] = safe(inc.totalSecurityDepositsFlow);
  if (inc.totalPersonalSavingsFlow) $inc['metrics.totalPersonalSavingsFlow'] = safe(inc.totalPersonalSavingsFlow);
  if (inc.totalInterestCollected) $inc['metrics.totalInterestCollected'] = safe(inc.totalInterestCollected);
  if (inc.totalFeesCollected) $inc['metrics.totalFeesCollected'] = safe(inc.totalFeesCollected);
  if (inc.totalCollected) $inc['metrics.totalCollected'] = safe(inc.totalCollected);
  if (inc.totalWaitingToBeCollected) $inc['metrics.totalWaitingToBeCollected'] = safe(inc.totalWaitingToBeCollected);
  if (inc.totalOverdue) $inc['metrics.totalOverdue'] = safe(inc.totalOverdue);
  if (inc.totalExpenses) $inc['metrics.totalExpenses'] = safe(inc.totalExpenses);
  if (inc.totalSavingsBalance) $inc['metrics.totalSavingsBalance'] = safe(inc.totalSavingsBalance);
  if (inc.totalPersonalSavingsBalance) $inc['metrics.totalPersonalSavingsBalance'] = safe(inc.totalPersonalSavingsBalance);
  if (inc.totalSecuritySavingsBalance) $inc['metrics.totalSecuritySavingsBalance'] = safe(inc.totalSecuritySavingsBalance);
  if (inc.totalLoansCount) $inc['metrics.totalLoansCount'] = safe(inc.totalLoansCount);
  // New metrics support
  if (inc.totalAppraisalFees) $inc['metrics.totalAppraisalFees'] = safe(inc.totalAppraisalFees);
  if (inc.totalPendingLoanAmount) $inc['metrics.totalPendingLoanAmount'] = safe(inc.totalPendingLoanAmount);
  if (inc.loanOfficerShortage) $inc['metrics.loanOfficerShortage'] = safe(inc.loanOfficerShortage);
  if (inc.branchShortage) $inc['metrics.branchShortage'] = safe(inc.branchShortage);
  if (inc.entityShortage) $inc['metrics.entityShortage'] = safe(inc.entityShortage);
  if (inc.badDebt) $inc['metrics.badDebt'] = safe(inc.badDebt);

  const now = new Date();
  // Build $set block with required fields first
  const setBlock = {
    computedAt: now,
    // Keep snapshot document anchored to the current day so "as-of" metrics reflect today's date
    dateKey: key,
    periodStart: start,
    periodEnd: end,
  };
  // Only set identity fields when provided (avoid overwriting with empty values)
  if (branchName) setBlock.branchName = branchName;
  if (branchCode) setBlock.branchCode = branchCode;
  if (currency) setBlock.currency = currency;
  // Optional audit/context fields - set when provided
  if (group) setBlock.group = group;
  if (groupName) setBlock.groupName = groupName;
  if (groupCode) setBlock.groupCode = groupCode;
  if (updatedBy) setBlock.updatedBy = updatedBy;
  if (updatedByName) setBlock.updatedByName = updatedByName;
  if (updatedByEmail) setBlock.updatedByEmail = updatedByEmail;
  if (updateSource) setBlock.updateSource = updateSource;

  const update = {
    $inc,
    $set: setBlock,
    $setOnInsert: {
      // Use nested paths to init timestamps; updatedAt handled by $set
      'metrics.createdAt': now,
    },
  };

  // If nothing to inc, still ensure the doc exists for the day
  if (Object.keys($inc).length === 0) {
    delete update.$inc;
  }

  // Prefer BranchRegistry mapping (per-branch stable id)
  let mappedId = null;
  try {
    if (branchCode) {
      const reg = await BranchRegistry.findOne({ branchCode }).select('snapshotId').lean();
      mappedId = reg && reg.snapshotId;
      try {
        console.log('[SNAPSHOT] registry lookup by branchCode', { branchCode, found: mappedId ? String(mappedId) : null });
      } catch (_) {}
    }
    if (!mappedId && branchName) {
      const regByName = await BranchRegistry.findOne({ branchName }).select('snapshotId').lean();
      mappedId = regByName && regByName.snapshotId;
      try {
        console.log('[SNAPSHOT] registry lookup by branchName', { branchName, found: mappedId ? String(mappedId) : null });
      } catch (_) {}
    }
  } catch (e) {
    console.error('[SNAPSHOT] BranchRegistry lookup failed', e);
  }

  // If no mapping exists, attempt to bootstrap one so we always update by a stable snapshotId
  if (!mappedId && (branchCode || branchName)) {
    try {
      const filter = branchCode ? { branchCode } : { branchName };
      const existingReg = await BranchRegistry.findOne(filter);
      if (existingReg && existingReg.snapshotId && mongoose.Types.ObjectId.isValid(existingReg.snapshotId)) {
        mappedId = existingReg.snapshotId;
      } else {
        // Create an initial snapshot doc for this branch/day
        const initDoc = await FinancialSnapshot.create({
          branchName: branchName || '',
          branchCode: branchCode || '',
          currency,
          dateKey: key,
          periodStart: start,
          periodEnd: end,
          metrics: { createdAt: now, updatedAt: now },
          computedAt: now,
          // seed audit if available
          ...(group ? { group } : {}),
          ...(groupName ? { groupName } : {}),
          ...(groupCode ? { groupCode } : {}),
          ...(updatedBy ? { updatedBy } : {}),
          ...(updatedByName ? { updatedByName } : {}),
          ...(updatedByEmail ? { updatedByEmail } : {}),
          ...(updateSource ? { updateSource } : {}),
        });
        try {
          console.log('[SNAPSHOT] bootstrap: created init snapshot', {
            snapshotId: String(initDoc._id),
            branchName: branchName || '',
            branchCode: branchCode || '',
            dateKey: key,
          });
        } catch (_) {}
        if (existingReg) {
          await BranchRegistry.updateOne(filter, { $set: { snapshotId: initDoc._id, branchName: branchName || '', branchCode: branchCode || '' } });
          mappedId = initDoc._id;
          try {
            console.log('[SNAPSHOT] bootstrap: attached snapshotId to existing BranchRegistry', {
              snapshotId: String(initDoc._id),
              filter,
            });
          } catch (_) {}
        } else {
          // Upsert the registry to point to this snapshot
          const reg = await BranchRegistry.findOneAndUpdate(
            filter,
            { $setOnInsert: { branchName: branchName || '', branchCode: branchCode || '', snapshotId: initDoc._id } },
            { new: true, upsert: true }
          ).lean();
          mappedId = (reg && reg.snapshotId) || initDoc._id;
          try {
            console.log('[SNAPSHOT] bootstrap: created BranchRegistry mapping', {
              snapshotId: String(initDoc._id),
              filter,
            });
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('[SNAPSHOT] bootstrap BranchRegistry mapping failed', e);
    }
  }

  if (mappedId && mongoose.Types.ObjectId.isValid(mappedId)) {
    try {
      console.log('[SNAPSHOT] updateById (registry)', { snapshotId: String(mappedId), dateKey: key, inc: update.$inc || {} });
    } catch (_) {}
    const doc = await FinancialSnapshot.findOneAndUpdate(
      { _id: mappedId },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: false, timestamps: false }
    );
    try { console.log('[SNAPSHOT] update result (registry)', { _id: doc?._id ? String(doc._id) : null }); } catch (_) {}
    return doc;
  }

  // Fallback to FIXED_SNAPSHOT_ID if provided
  if (FIXED_SNAPSHOT_ID && mongoose.Types.ObjectId.isValid(FIXED_SNAPSHOT_ID)) {
    try {
      console.log('[SNAPSHOT] updateById (FIXED_SNAPSHOT_ID)', { snapshotId: String(FIXED_SNAPSHOT_ID), dateKey: key, inc: update.$inc || {} });
    } catch (_) {}
    const doc = await FinancialSnapshot.findOneAndUpdate(
      { _id: FIXED_SNAPSHOT_ID },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: false, timestamps: false }
    );
    try { console.log('[SNAPSHOT] update result (FIXED_SNAPSHOT_ID)', { _id: doc?._id ? String(doc._id) : null }); } catch (_) {}
    return doc;
  }

  // Last resort: use compound key (may create per-day docs)
  try { console.log('[SNAPSHOT] updateByCompoundKey', { branchName: branchName || '', branchCode: branchCode || '', currency, dateKey: key, inc: update.$inc || {} }); } catch (_) {}
  const doc = await FinancialSnapshot.findOneAndUpdate(
    { branchName: branchName || '', branchCode: branchCode || '', currency, dateKey: key },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: false, timestamps: false }
  );
  try { console.log('[SNAPSHOT] update result (compoundKey)', { _id: doc?._id ? String(doc._id) : null }); } catch (_) {}
  return doc;
}

async function incrementForLoanApproval({ loan, date = new Date(), user = null, groupInfo = null, updateSource = 'loanApproval' }) {
  if (!loan) return null;
  const principal = Number(loan.loanAmount || 0);
  const ratePct = Number(loan.interestRate || 0);
  const totalRepayable = principal * (1 + (ratePct / 100));
  try {
    console.log('[SNAPSHOT] incrementForLoanApproval', {
      loanId: String(loan._id || ''),
      branchName: loan.branchName,
      branchCode: loan.branchCode,
      currency: loan.currency,
      date: new Date(date).toISOString(),
      totalRepayable,
      updateSource,
    });
  } catch (_) {}
  // Track loan approval count and decrement pending amount (approval reduces pending bucket).
  // Do NOT modify totalWaitingToBeCollected here.
  return incrementMetrics({
    branchName: loan.branchName,
    branchCode: loan.branchCode,
    currency: loan.currency,
    date,
    inc: { totalLoansCount: 1, totalPendingLoanAmount: -1 * principal },
    // audit
    group: (groupInfo && (groupInfo.group || groupInfo.groupId)) || loan.group || null,
    groupName: (groupInfo && groupInfo.groupName) || '',
    groupCode: (groupInfo && groupInfo.groupCode) || '',
    updatedBy: user && user.id ? user.id : null,
    updatedByName: user && user.username ? user.username : '',
    updatedByEmail: user && user.email ? user.email : '',
    updateSource,
  });
}

async function incrementForCollection({ loan, entry, user = null, groupInfo = null, updateSource = 'loanCollection' }) {
  if (!loan || !entry) return null;
  const interest = Number(entry.interestPortion || 0);
  const fees = Number(entry.feesPortion || 0);
  const principal = Number(entry.principalPortion || 0);
  // Decrease outstanding waiting by the amount of principal + interest collected
  const waitingDelta = -1 * (principal + interest);
  const profit = interest + fees; // simplified to match computeDailySnapshot
  // If loan is overdue as of the collection date, reduce the overdue bucket
  let overdueDelta = 0;
  // Arrears (shortfall) or catch-up relative to expected weekly amount
  // Use entry.weeklyAmount if provided (set by controller), else fall back to loan.weeklyInstallment
  const expectedWeekly = Number(entry.weeklyAmount || loan.weeklyInstallment || 0);
  const paidThisEntry = Number(entry.fieldCollection || 0) + Number(entry.advancePayment || 0);
  // Positive => shortfall (increase overdue). Negative => overpay (reduce overdue).
  const arrearsDelta = Math.round((expectedWeekly - paidThisEntry) * 100) / 100;
  try {
    const endDate = loan.endingDate ? new Date(loan.endingDate) : null;
    const collDate = entry.collectionDate ? new Date(entry.collectionDate) : new Date();
    if (endDate && collDate > endDate && loan.status === 'active') {
      const colls = Array.isArray(loan.collections) ? loan.collections : [];
      // Sum all collections up to and including this entry's date
      const sumIncluding = colls.reduce((acc, c) => {
        if (!c || !c.collectionDate) return acc;
        const cDate = new Date(c.collectionDate);
        if (cDate <= collDate) {
          return acc + Number(c.fieldCollection || 0);
        }
        return acc;
      }, 0);
      // Approximate prior sum by excluding this entry's fieldCollection
      const sumBefore = Math.max(sumIncluding - Number(entry.fieldCollection || 0), 0);
      const principalOnly = Number(loan.loanAmount || 0);
      const outstandingBefore = Math.max(principalOnly - sumBefore, 0);
      const outstandingAfter = Math.max(principalOnly - sumIncluding, 0);
      const decrease = Math.max(outstandingBefore - outstandingAfter, 0);
      overdueDelta = -1 * decrease; // decrement overdue by the actual reduction
    }
  } catch (e) {
    // non-fatal: log and proceed without overdue adjustment
    try { console.error('[SNAPSHOT] overdueDelta compute failed', e); } catch (_) {}
  }
  try {
    console.log('[SNAPSHOT] incrementForCollection', {
      loanId: String(loan._id || ''),
      branchName: loan.branchName,
      branchCode: loan.branchCode,
      currency: loan.currency,
      date: (entry.collectionDate || new Date()).toISOString?.() || '',
      interest,
      fees,
      principal,
      waitingDelta,
      profit,
      overdueDelta,
      expectedWeekly,
      paidThisEntry,
      arrearsDelta
    });
  } catch (_) {}

  const inc = {
    totalInterestCollected: interest,
    totalFeesCollected: fees,
    totalCollected: principal,
    totalWaitingToBeCollected: waitingDelta,
    totalProfit: profit,
  };
  // Apply arrears adjustment first (can be positive or negative)
  if (arrearsDelta) {
    inc.totalOverdue = (inc.totalOverdue || 0) + arrearsDelta;
  }
  // Apply post-endingDate overdue reduction
  if (overdueDelta) {
    inc.totalOverdue = (inc.totalOverdue || 0) + overdueDelta;
  }

  return incrementMetrics({
    branchName: loan.branchName,
    branchCode: loan.branchCode,
    currency: loan.currency,
    date: entry.collectionDate || new Date(),
    inc,
    // audit
    group: (groupInfo && (groupInfo.group || groupInfo.groupId)) || loan.group || null,
    groupName: (groupInfo && groupInfo.groupName) || '',
    groupCode: (groupInfo && groupInfo.groupCode) || '',
    updatedBy: user && user.id ? user.id : null,
    updatedByName: user && user.username ? user.username : '',
    updatedByEmail: user && user.email ? user.email : '',
    updateSource,
  });
}

module.exports = {
  incrementMetrics,
  incrementForLoanApproval,
  incrementForCollection,
  dayBounds,
  toDateKey,
};
