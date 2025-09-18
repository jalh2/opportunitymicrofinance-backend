const Metric = require('../models/Metric');
const bus = require('./eventBus');

function normalizeDay(d) {
  const dt = d ? new Date(d) : new Date();
  dt.setHours(0, 0, 0, 0);
  return dt;
}

async function recordMetric({
  metric,
  value,
  date,
  branchName,
  branchCode,
  loanOfficerName,
  currency,
  loan,
  group,
  client,
  extra,
}) {
  if (value == null || isNaN(Number(value))) return null;
  const day = normalizeDay(date);
  const doc = await Metric.create({
    metric,
    value: Number(value),
    date: date || new Date(),
    day,
    branchName,
    branchCode,
    loanOfficerName,
    currency,
    loan,
    group,
    client,
    extra,
  });
  try {
    bus.emit('metrics:changed', {
      kind: 'single',
      docs: [
        {
          metric: doc.metric,
          value: doc.value,
          date: doc.date,
          branchName: doc.branchName,
          branchCode: doc.branchCode,
          loanOfficerName: doc.loanOfficerName,
          currency: doc.currency,
          loan: doc.loan,
          group: doc.group,
          client: doc.client,
        },
      ],
    });
  } catch (_) {}
  return doc;
}

async function recordMany(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const docs = events
    .filter((e) => e && e.metric && e.value != null && !isNaN(Number(e.value)))
    .map((e) => ({
      ...e,
      value: Number(e.value),
      day: normalizeDay(e.date || new Date()),
      date: e.date || new Date(),
    }));
  if (docs.length === 0) return [];
  const inserted = await Metric.insertMany(docs);
  try {
    bus.emit('metrics:changed', {
      kind: 'batch',
      docs: inserted.map((doc) => ({
        metric: doc.metric,
        value: doc.value,
        date: doc.date,
        branchName: doc.branchName,
        branchCode: doc.branchCode,
        loanOfficerName: doc.loanOfficerName,
        currency: doc.currency,
        loan: doc.loan,
        group: doc.group,
        client: doc.client,
      })),
    });
  } catch (_) {}
  return inserted;
}

function computeInterestForLoan(loan) {
  // Basic flat interest assumption: interestRate is a percent over the full loan amount for the term
  const amt = Number(loan.loanAmount || 0);
  const rate = Number(loan.interestRate || 0);
  const interest = Number(((amt * rate) / 100).toFixed(2));
  return isNaN(interest) ? 0 : interest;
}

function collateralValueFromLoan(loan) {
  const cash = Number(loan.collateralCashAmount || 0);
  const item = Number((loan.collateralItem && loan.collateralItem.estimatedValue) || 0);
  const total = Number((cash + item).toFixed(2));
  return isNaN(total) ? 0 : total;
}

module.exports = {
  normalizeDay,
  recordMetric,
  recordMany,
  computeInterestForLoan,
  collateralValueFromLoan,
};
