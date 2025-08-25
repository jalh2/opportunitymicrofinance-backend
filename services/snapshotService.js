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

async function incrementMetrics({ branchName = '', branchCode = '', currency = 'LRD', date = new Date(), inc = {} }) {
  const { start, end, key } = dayBounds(date);
  const $inc = {};
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  try {
    console.log('[SNAPSHOT] incrementMetrics request', {
      branchName: branchName || '',
      branchCode: branchCode || '',
      currency,
      dateKey: key,
      inc
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
  if (inc.totalWaitingToBeCollected) $inc['metrics.totalWaitingToBeCollected'] = safe(inc.totalWaitingToBeCollected);
  if (inc.totalOverdue) $inc['metrics.totalOverdue'] = safe(inc.totalOverdue);
  if (inc.totalExpenses) $inc['metrics.totalExpenses'] = safe(inc.totalExpenses);
  if (inc.totalSavingsBalance) $inc['metrics.totalSavingsBalance'] = safe(inc.totalSavingsBalance);
  if (inc.totalPersonalSavingsBalance) $inc['metrics.totalPersonalSavingsBalance'] = safe(inc.totalPersonalSavingsBalance);
  if (inc.totalSecuritySavingsBalance) $inc['metrics.totalSecuritySavingsBalance'] = safe(inc.totalSecuritySavingsBalance);
  if (inc.totalLoansCount) $inc['metrics.totalLoansCount'] = safe(inc.totalLoansCount);

  const now = new Date();
  const update = {
    $inc,
    $set: {
      computedAt: now,
      // identity/date fields only set on insert to avoid operator conflicts
    },
    $setOnInsert: {
      branchName: branchName || '',
      branchCode: branchCode || '',
      currency,
      dateKey: key,
      periodStart: start,
      periodEnd: end,
      // Use nested paths to avoid conflicts with $set on 'metrics.updatedAt'
      'metrics.createdAt': now,
      'metrics.updatedAt': now,
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
      { new: true, upsert: true }
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
      { new: true, upsert: true }
    );
    try { console.log('[SNAPSHOT] update result (FIXED_SNAPSHOT_ID)', { _id: doc?._id ? String(doc._id) : null }); } catch (_) {}
    return doc;
  }

  // Last resort: use compound key (may create per-day docs)
  try { console.log('[SNAPSHOT] updateByCompoundKey', { branchName: branchName || '', branchCode: branchCode || '', currency, dateKey: key, inc: update.$inc || {} }); } catch (_) {}
  const doc = await FinancialSnapshot.findOneAndUpdate(
    { branchName: branchName || '', branchCode: branchCode || '', currency, dateKey: key },
    update,
    { new: true, upsert: true }
  );
  try { console.log('[SNAPSHOT] update result (compoundKey)', { _id: doc?._id ? String(doc._id) : null }); } catch (_) {}
  return doc;
}

async function incrementForLoanApproval({ loan, date = new Date() }) {
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
      totalRepayable
    });
  } catch (_) {}
  return incrementMetrics({
    branchName: loan.branchName,
    branchCode: loan.branchCode,
    currency: loan.currency,
    date,
    inc: { totalLoansCount: 1, totalWaitingToBeCollected: totalRepayable },
  });
}

async function incrementForCollection({ loan, entry }) {
  if (!loan || !entry) return null;
  const interest = Number(entry.interestPortion || 0);
  const fees = Number(entry.feesPortion || 0);
  const principal = Number(entry.principalPortion || 0);
  // Decrease outstanding waiting by the amount of principal + interest collected
  const waitingDelta = -1 * (principal + interest);
  const profit = interest + fees; // simplified to match computeDailySnapshot
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
      profit
    });
  } catch (_) {}

  return incrementMetrics({
    branchName: loan.branchName,
    branchCode: loan.branchCode,
    currency: loan.currency,
    date: entry.collectionDate || new Date(),
    inc: {
      totalInterestCollected: interest,
      totalFeesCollected: fees,
      totalWaitingToBeCollected: waitingDelta,
      totalProfit: profit,
    },
  });
}

module.exports = {
  incrementMetrics,
  incrementForLoanApproval,
  incrementForCollection,
  dayBounds,
  toDateKey,
};
