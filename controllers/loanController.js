const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const Client = require('../models/Client');
const Group = require('../models/Group');
const metricService = require('../services/metricService');
// Note: Removed PersonalSavingsAccount auto-deposit on loan approval; no import required

// Create a new loan application
exports.createLoan = async (req, res) => {
  try {
    const {
      group,
      client, // required: per-client loan
      branchName,
      branchCode,
      meetingTime,
      meetingDay,
      memberCode,
      memberAddress,
      guarantorName,
      guarantorRelationship,
      guarantorImage, // new field
      loanAmount,
      loanAmountInWords,
      loanDurationNumber,
      loanDurationUnit,
      purposeOfLoan,
      businessType,
      disbursementDate,
      endingDate,
      previousLoanInfo,
      memberOccupation,
      weeklyInstallment,
      securityDeposit,
      memberAdmissionFee,
      rentingOrOwner,
      educationBackground,
      district,
      maritalStatus,
      dependents,
      previousLoanSource,
      signatories,
      collections,
      interestRate,
      loanOfficerName,
      status,
      currency,
    } = req.body;

    // Resolve client and group, and validate that client belongs to the group
    let clientDoc = null;
    let groupId = group || null;
    if (client) {
      clientDoc = await Client.findById(client).select('group memberName');
      if (!clientDoc) return res.status(404).json({ message: 'Client not found' });
      if (!groupId) groupId = clientDoc.group;
    }
    if (!client) {
      return res.status(400).json({ message: 'client is required for per-client loans' });
    }
    const groupData = await Group.findById(groupId);
    if (!groupData) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (clientDoc && String(clientDoc.group) !== String(groupData._id)) {
      return res.status(400).json({ message: 'Client does not belong to the specified group' });
    }

    const loan = new Loan({
      group: groupData._id,
      client: clientDoc ? clientDoc._id : undefined,
      branchName,
      branchCode,
      meetingTime,
      meetingDay,
      memberCode,
      memberAddress,
      guarantorName,
      guarantorRelationship,
      guarantorImage,
      loanAmount,
      loanAmountInWords,
      loanDurationNumber,
      loanDurationUnit,
      purposeOfLoan,
      businessType,
      disbursementDate,
      endingDate,
      previousLoanInfo,
      memberOccupation,
      weeklyInstallment,
      securityDeposit,
      memberAdmissionFee,
      rentingOrOwner,
      educationBackground,
      district,
      maritalStatus,
      dependents,
      previousLoanSource,
      signatories,
      collections,
      interestRate,
      loanOfficerName,
      status,
      currency,
    });

    await loan.save();
    // Increment appraisal fee (2%) and pending principal on creation
    try {
      const principal = Number(loan.loanAmount || 0);
      const appraisalFee = Math.round(principal * 0.02 * 100) / 100;
      await metricService.incrementMetrics({
        branchName: loan.branchName,
        branchCode: loan.branchCode,
        currency: loan.currency,
        date: new Date(),
        inc: {
          totalAppraisalFees: appraisalFee,
          // Include appraisal fees in overall fees collected and profit (business rule)
          totalFeesCollected: appraisalFee,
          totalProfit: appraisalFee,
          totalPendingLoanAmount: principal,
        },
        // audit/context
        group: loan.group,
        groupName: groupData.groupName,
        groupCode: groupData.groupCode,
        updatedBy: req.user && req.user.id ? req.user.id : null,
        updatedByName: req.user && req.user.username ? req.user.username : '',
        updatedByEmail: req.user && req.user.email ? req.user.email : '',
        // rich context
        loan: loan._id || null,
        client: loan.client || null,
        loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
        updateSource: 'loanCreate',
      });
    } catch (e) {
      console.error('[SNAPSHOT] increment on loan create failed', e);
    }
    // If loan is submitted (not active yet), record pending security deposit
    try {
      const security = Number(loan.securityDeposit || 0);
      if (security > 0 && status !== 'active') {
        await metricService.incrementMetrics({
          branchName: loan.branchName,
          branchCode: loan.branchCode,
          currency: loan.currency,
          date: new Date(),
          inc: { totalPendingSecurityDeposit: security },
          // audit/context
          group: loan.group,
          groupName: groupData.groupName,
          groupCode: groupData.groupCode,
          updatedBy: req.user && req.user.id ? req.user.id : null,
          updatedByName: req.user && req.user.username ? req.user.username : '',
          updatedByEmail: req.user && req.user.email ? req.user.email : '',
          // rich context
          loan: loan._id || null,
          client: loan.client || null,
          loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
          updateSource: 'loanCreate',
        });
      }
    } catch (e) {
      console.error('[SNAPSHOT] pending security deposit increment on create failed', e);
    }
    // If loan is created already active, increment snapshot for approval day
    try {
      if (status === 'active') {
        await metricService.incrementForLoanApproval({
          loan,
          date: new Date(),
          user: req.user || null,
          groupInfo: { group: loan.group, groupName: groupData.groupName, groupCode: groupData.groupCode },
          updateSource: 'loanApproval',
        });
        // Tally this disbursed loan amount into the group's cumulative total
        try {
          await Group.findByIdAndUpdate(loan.group, { $inc: { groupTotalLoanAmount: Number(loan.loanAmount || 0) } });
        } catch (eInc) {
          console.error('[GROUP] Failed to increment groupTotalLoanAmount on create(active)', eInc);
        }
        // Convert pending admissions to actual and clear pending security deposit
        try {
          const security = Number(loan.securityDeposit || 0);
          if (security > 0) {
            await metricService.incrementMetrics({
              branchName: loan.branchName,
              branchCode: loan.branchCode,
              currency: loan.currency || 'LRD',
              date: new Date(),
              inc: { totalPendingSecurityDeposit: -security },
              group: loan.group,
              groupName: groupData.groupName || '',
              groupCode: groupData.groupCode || '',
              updatedBy: (req.user && req.user.id) || null,
              updatedByName: (req.user && req.user.username) || '',
              updatedByEmail: (req.user && req.user.email) || '',
              loan: loan._id || null,
              client: loan.client || null,
              loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
              updateSource: 'loanApproval',
            });
          }
          const admissionFee = Number(loan.memberAdmissionFee || 1000);
          await metricService.incrementMetrics({
            branchName: loan.branchName,
            branchCode: loan.branchCode,
            currency: 'LRD',
            date: new Date(),
            inc: {
              totalPendingAdmissionFees: -admissionFee,
              totalAdmissionFees: admissionFee,
              totalFeesCollected: admissionFee,
              totalProfit: admissionFee,
            },
            group: loan.group,
            groupName: groupData.groupName || '',
            groupCode: groupData.groupCode || '',
            updatedBy: (req.user && req.user.id) || null,
            updatedByName: (req.user && req.user.username) || '',
            updatedByEmail: (req.user && req.user.email) || '',
            loan: loan._id || null,
            client: loan.client || null,
            loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
            updateSource: 'loanApproval',
          });
        } catch (eConv) {
          console.error('[SNAPSHOT] convert pending to actual on create(active) failed', eConv);
        }
        // Business rule: Do NOT auto-deposit security deposit into PersonalSavingsAccount on approval.
        // Security deposits are managed separately via group Savings transactions (type: 'security').
      }
    } catch (e) {
      console.error('[SNAPSHOT] incrementForLoanApproval failed', e);
    }
    // Return populated loan with groupName for frontend display
    const populated = await Loan.findById(loan._id)
      .populate('group', 'groupName')
      .populate('client', 'memberName passBookNumber');
    res.status(201).json(populated);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error creating loan', error: error.message });
  }
};

// List loans that have a scheduled collection falling within a date range
// GET /api/loans/collections-due?branchName=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&currency=USD|LRD
exports.listCollectionsDue = async (req, res) => {
  try {
    const { branchName, startDate, endDate, currency } = req.query;
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

    // Build base query: active loans for this branch overlapping the period
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
      .populate('group', 'groupName groupCode meetingDay')
      .populate('client', 'memberName passBookNumber')
      .select('group client weeklyInstallment disbursementDate collectionStartDate endingDate meetingDay branchName branchCode currency collections loanOfficerName loanAmount loanDurationNumber loanDurationUnit interestRate');

    // Map weekday names to indices (0=Sun..6=Sat)
    const dayIndexMap = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
    const msPerDay = 24 * 60 * 60 * 1000;
    // helper to convert duration to weeks
    const toWeeks = (n, unit) => {
      const num = Number(n || 0);
      switch (unit) {
        case 'days': return Math.max(Math.ceil(num / 7), 0);
        case 'weeks': return Math.max(num, 0);
        case 'months': return Math.max(num * 4, 0);
        case 'years': return Math.max(num * 52, 0);
        default: return Math.max(num, 0);
      }
    };

    const items = [];
    for (const loan of loans) {
      const expectedPerWeek = Math.max(Number(loan.weeklyInstallment || 0), 0);
      if (!(expectedPerWeek > 0)) continue;

      const loanStart = loan.collectionStartDate
        ? new Date(loan.collectionStartDate)
        : (loan.disbursementDate ? new Date(loan.disbursementDate) : start);
      const loanEnd = loan.endingDate ? new Date(loan.endingDate) : end;
      const overlaps = loanStart <= end && loanEnd >= start;
      if (!overlaps) continue;

      // Determine the scheduled due date within [start, end]
      let dueDateKey = null;
      let meetingIdx = null;
      if (loan.meetingDay || (loan.group && loan.group.meetingDay)) {
        const md = String(loan.meetingDay || (loan.group && loan.group.meetingDay) || '').toLowerCase();
        meetingIdx = dayIndexMap[md];
      }
      if (meetingIdx != null) {
        for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d = new Date(d.getTime() + msPerDay)) {
          if (d.getDay() === meetingIdx) {
            const activeOnDay = (!loan.disbursementDate || d >= loanStart) && (!loan.endingDate || d <= loanEnd);
            if (activeOnDay) {
              dueDateKey = d.toISOString().slice(0, 10);
              break;
            }
          }
        }
      }
      if (!dueDateKey) {
        // Fallback: first active day within the window
        for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d = new Date(d.getTime() + msPerDay)) {
          const activeOnDay = (!loan.disbursementDate || d >= loanStart) && (!loan.endingDate || d <= loanEnd);
          if (activeOnDay) {
            dueDateKey = d.toISOString().slice(0, 10);
            break;
          }
        }
      }
      if (!dueDateKey) continue;

      // Sum collections that occurred on the due date (currency-checked if filter provided)
      let collectedOnDueDate = 0;
      if (Array.isArray(loan.collections)) {
        for (const c of loan.collections) {
          if (!c || !c.collectionDate) continue;
          if (currency && c.currency && c.currency !== currency) continue;
          const key = new Date(c.collectionDate).toISOString().slice(0, 10);
          if (key === dueDateKey) {
            collectedOnDueDate += Number(c.fieldCollection || 0);
          }
        }
      }

      // Overdue for the due date (same-day shortage semantics, renamed)
      const overdue = Math.max(expectedPerWeek - collectedOnDueDate, 0);

      // Compute remaining total repayable balance as of the due date (inclusive)
      // Total repayable = weeklyInstallment * weeks (when weeks>0), otherwise loanAmount * (1 + interestRate/100)
      // Collected to date = sum(fieldCollection) for all collections up to and including dueDateKey, currency-aligned
      let collectedToDate = 0;
      if (Array.isArray(loan.collections) && loan.collections.length > 0) {
        for (const c of loan.collections) {
          if (!c || !c.collectionDate) continue;
          const key = new Date(c.collectionDate).toISOString().slice(0, 10);
          if (key > dueDateKey) continue;
          if (c.currency && loan.currency && c.currency !== loan.currency) continue;
          collectedToDate += Number(c.fieldCollection || 0);
        }
      }
      const weeks = toWeeks(loan.loanDurationNumber, loan.loanDurationUnit);
      const ratePct = Number(loan.interestRate || 0);
      const totalRepayableViaWeeks = (weeks > 0) ? (Number(loan.weeklyInstallment || 0) * weeks) : null;
      const totalRepayableViaRate = Number(loan.loanAmount || 0) * (1 + (ratePct / 100));
      const totalRepayable = Number.isFinite(totalRepayableViaWeeks) && totalRepayableViaWeeks > 0
        ? totalRepayableViaWeeks
        : totalRepayableViaRate;
      const remaining = Number(totalRepayable || 0) - Number(collectedToDate || 0);
      const loanBalance = Math.max(Math.round(remaining * 100) / 100, 0);

      // Overdue to date = cumulative expected up to due date (inclusive) minus collected to date
      // Compute elapsed weeks since disbursement up to due date, capped by total weeks
      const dueDateObj = new Date(dueDateKey);
      const elapsedWeeksRaw = Math.floor(((dueDateObj - loanStart) / msPerDay) / 7) + 1; // inclusive of current week
      const elapsedWeeks = Math.max(0, Math.min(weeks, elapsedWeeksRaw));
      let expectedCumulative = Number(expectedPerWeek || 0) * elapsedWeeks;
      if (Number.isFinite(totalRepayable) && totalRepayable > 0) {
        expectedCumulative = Math.min(expectedCumulative, Number(totalRepayable || 0)); // cap by total repayable to handle rounding/remainder
      }
      expectedCumulative = Math.round(expectedCumulative * 100) / 100;
      const overdueToDate = Math.max(expectedCumulative - Number(collectedToDate || 0), 0);

      items.push({
        loanId: String(loan._id),
        groupId: loan.group && (loan.group._id || loan.group),
        groupName: (loan.group && loan.group.groupName) || '',
        groupCode: (loan.group && loan.group.groupCode) || '',
        clientId: loan.client && (loan.client._id || loan.client),
        clientName: loan.client && loan.client.memberName ? loan.client.memberName : '',
        branchName: loan.branchName,
        branchCode: loan.branchCode,
        currency: loan.currency || null,
        meetingDay: loan.meetingDay || (loan.group && loan.group.meetingDay) || null,
        loanOfficerName: loan.loanOfficerName || '',
        dueDate: dueDateKey,
        expected: Math.round(expectedPerWeek * 100) / 100,
        collected: Math.round(collectedOnDueDate * 100) / 100,
        // keep 'shortage' for backward compatibility; prefer 'overdue'
        shortage: Math.round(overdue * 100) / 100,
        overdue: Math.round(overdue * 100) / 100,
        overdueToDate: Math.round(overdueToDate * 100) / 100,
        loanAmount: Math.round(Number(loan.loanAmount || 0) * 100) / 100,
        loanBalance,
      });
    }

    // Sort by dueDate ascending then by groupName then clientName
    items.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? 1 * -1 : 1;
      const gcmp = String(a.groupName || '').localeCompare(String(b.groupName || ''));
      if (gcmp !== 0) return gcmp;
      return String(a.clientName || '').localeCompare(String(b.clientName || ''));
    });

    return res.status(200).json({ branchName, currency: currency || null, startDate: start.toISOString(), endDate: end.toISOString(), items });
  } catch (error) {
    console.error('[listCollectionsDue] error:', error);
    return res.status(500).json({ message: 'Error listing collections due', error: error.message || 'Unknown error' });
  }
};

// Update loan status (e.g., approve -> active) and compute weekly per-member installment on approval
exports.setLoanStatus = async (req, res) => {
  try {
    const { status } = req.body; // expected one of ['pending','denied','active','paid','defaulted']
    const allowed = ['pending', 'denied', 'active', 'paid', 'defaulted'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    // Helper: convert duration to weeks
    const toWeeks = (n, unit) => {
      const num = Number(n || 0);
      switch (unit) {
        case 'days': return Math.max(Math.ceil(num / 7), 0);
        case 'weeks': return Math.max(num, 0);
        case 'months': return Math.max(num * 4, 0); // approximate 4 weeks per month
        case 'years': return Math.max(num * 52, 0);
        default: return Math.max(num, 0);
      }
    };

    // Load loan and related group
    const loan = await Loan.findById(req.params.id)
      .populate('group', 'groupName groupCode branchName')
      .populate('client', 'memberName');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    const prevStatus = loan.status;
    loan.status = status;
    // On activation, if disbursementDate is missing, set it to now so daily metrics align
    if (prevStatus !== 'active' && status === 'active' && !loan.disbursementDate) {
      loan.disbursementDate = new Date();
    }

    if (status === 'active') {
      const weeks = toWeeks(loan.loanDurationNumber, loan.loanDurationUnit);
      if (weeks > 0 && Number.isFinite(loan.loanAmount)) {
        const ratePct = Number(loan.interestRate || 0);
        const totalRepayable = Number(loan.loanAmount) * (1 + (ratePct / 100));
        const weekly = totalRepayable / weeks; // per-loan weekly installment
        loan.weeklyInstallment = Math.round(weekly * 100) / 100;
      }
    }

    await loan.save();
    // If status just transitioned to 'active', increment snapshot for approval
    try {
      if (prevStatus !== 'active' && status === 'active') {
        await metricService.incrementForLoanApproval({
          loan,
          date: new Date(),
          user: req.user || null,
          groupInfo: {
            group: (loan.group && loan.group._id) ? loan.group._id : loan.group,
            groupName: loan.group && loan.group.groupName ? loan.group.groupName : '',
            groupCode: loan.group && loan.group.groupCode ? loan.group.groupCode : '',
          },
          updateSource: 'loanApproval',
        });
        // Increment group's total loan amount tally once on activation
        try {
          const grpId = (loan.group && loan.group._id) ? loan.group._id : loan.group;
          await Group.findByIdAndUpdate(grpId, { $inc: { groupTotalLoanAmount: Number(loan.loanAmount || 0) } });
        } catch (eInc) {
          console.error('[GROUP] Failed to increment groupTotalLoanAmount on status activate', eInc);
        }
        // Convert pending admissions to actual and clear pending security deposit
        try {
          const security = Number(loan.securityDeposit || 0);
          if (security > 0) {
            await metricService.incrementMetrics({
              branchName: loan.branchName,
              branchCode: loan.branchCode,
              currency: loan.currency || 'LRD',
              date: new Date(),
              inc: { totalPendingSecurityDeposit: -security },
              group: (loan.group && loan.group._id) ? loan.group._id : loan.group,
              groupName: loan.group && loan.group.groupName ? loan.group.groupName : '',
              groupCode: loan.group && loan.group.groupCode ? loan.group.groupCode : '',
              updatedBy: (req.user && req.user.id) || null,
              updatedByName: (req.user && req.user.username) || '',
              updatedByEmail: (req.user && req.user.email) || '',
              loan: loan._id || null,
              client: (loan.client && loan.client._id) ? loan.client._id : loan.client,
              loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
              updateSource: 'loanApproval',
            });
          }
          const admissionFee = Number(loan.memberAdmissionFee || 1000);
          await metricService.incrementMetrics({
            branchName: loan.branchName,
            branchCode: loan.branchCode,
            currency: 'LRD',
            date: new Date(),
            inc: {
              totalPendingAdmissionFees: -admissionFee,
              totalAdmissionFees: admissionFee,
              totalFeesCollected: admissionFee,
              totalProfit: admissionFee,
            },
            group: (loan.group && loan.group._id) ? loan.group._id : loan.group,
            groupName: loan.group && loan.group.groupName ? loan.group.groupName : '',
            groupCode: loan.group && loan.group.groupCode ? loan.group.groupCode : '',
            updatedBy: (req.user && req.user.id) || null,
            updatedByName: (req.user && req.user.username) || '',
            updatedByEmail: (req.user && req.user.email) || '',
            loan: loan._id || null,
            client: (loan.client && loan.client._id) ? loan.client._id : loan.client,
            loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
            updateSource: 'loanApproval',
          });
        } catch (eConv) {
          console.error('[SNAPSHOT] convert pending to actual on status activate failed', eConv);
        }
      }
    } catch (e) {
      console.error('[SNAPSHOT] incrementForLoanApproval (status change) failed', e);
    }
    // On denial, clear pending amounts (principal and security deposit) since the loan won't proceed
    try {
      if (prevStatus !== 'denied' && status === 'denied' && prevStatus !== 'active') {
        const principal = Number(loan.loanAmount || 0);
        const security = Number(loan.securityDeposit || 0);
        await metricService.incrementMetrics({
          branchName: loan.branchName,
          branchCode: loan.branchCode,
          currency: loan.currency || 'LRD',
          date: new Date(),
          inc: {
            totalPendingLoanAmount: -principal,
            ...(security > 0 ? { totalPendingSecurityDeposit: -security } : {}),
          },
          group: (loan.group && loan.group._id) ? loan.group._id : loan.group,
          groupName: loan.group && loan.group.groupName ? loan.group.groupName : '',
          groupCode: loan.group && loan.group.groupCode ? loan.group.groupCode : '',
          updatedBy: (req.user && req.user.id) || null,
          updatedByName: (req.user && req.user.username) || '',
          updatedByEmail: (req.user && req.user.email) || '',
          loan: loan._id || null,
          client: (loan.client && loan.client._id) ? loan.client._id : loan.client,
          loanOfficerName: loan.loanOfficerName || ((req.user && req.user.username) || ''),
          updateSource: 'loanDenied',
        });
      }
    } catch (e) {
      console.error('[SNAPSHOT] clear pending on denial failed', e);
    }
    // Business rule: Do NOT auto-deposit security deposit into PersonalSavingsAccount on activation.
    // Security deposits are managed separately via group Savings transactions (type: 'security').
    // Return populated loan so UI consistently has groupName and member names
    const populated = await Loan.findById(loan._id)
      .populate('group', 'groupName')
      .populate('client', 'memberName passBookNumber');
    return res.json(populated);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error updating loan status', error: error.message });
  }
};

// Get all loans
exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find()
      .populate('group', 'groupName')
      .populate('client', 'memberName passBookNumber');
    res.json(loans);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get loan by ID
exports.getLoanById = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('group')
      .populate('client');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    res.json(loan);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Update a loan
exports.updateLoan = async (req, res) => {
  try {
    const loan = await Loan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    // Return populated loan for consistent frontend display
    const populated = await Loan.findById(loan._id)
      .populate('group', 'groupName')
      .populate('client', 'memberName passBookNumber');
    res.json(populated);
  } catch (error) {
    console.error(error.message);
    res.status(400).json({ message: 'Error updating loan', error: error.message });
  }
};

// Delete a loan
exports.deleteLoan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }
    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    await Loan.findByIdAndDelete(id);
    return res.json({ message: 'Loan removed' });
  } catch (error) {
    console.error('[DELETE /api/loans/:id] error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add a collection record to a loan
exports.addCollection = async (req, res) => {
    try {
        const loan = await Loan.findById(req.params.id).populate('client', 'memberName');
        if (!loan) {
            return res.status(404).json({ message: 'Loan not found' });
        }
        if (loan.status !== 'active') {
            return res.status(400).json({ message: 'Cannot add collections to a loan that is not active' });
        }

        const entry = { ...req.body };
        // Ensure currency matches the loan currency
        if (!entry.currency) {
          entry.currency = loan.currency;
        }
        if (entry.currency !== loan.currency) {
          return res.status(400).json({ message: `Collection currency ${entry.currency} does not match loan currency ${loan.currency}` });
        }

        // Compute defaults and breakdowns if missing
        const toWeeks = (n, unit) => {
          const num = Number(n || 0);
          switch (unit) {
            case 'days': return Math.max(Math.ceil(num / 7), 0);
            case 'weeks': return Math.max(num, 0);
            case 'months': return Math.max(num * 4, 0);
            case 'years': return Math.max(num * 52, 0);
            default: return Math.max(num, 0);
          }
        };
        const weeks = toWeeks(loan.loanDurationNumber, loan.loanDurationUnit);
        // Per-loan expected amounts
        const expectedWeekly = Number(loan.weeklyInstallment || 0);
        const expectedPrincipalWeekly = (weeks > 0)
          ? Number(loan.loanAmount || 0) / weeks
          : 0;
        const expectedInterestWeekly = Math.max(expectedWeekly - expectedPrincipalWeekly, 0);
        // normalize incoming numbers
        entry.advancePayment = Number(entry.advancePayment || 0);
        entry.fieldCollection = Number(entry.fieldCollection || 0);
        if (!Number(entry.weeklyAmount)) entry.weeklyAmount = expectedWeekly;
        if (!Number(entry.loanAmount)) entry.loanAmount = entry.weeklyAmount;
        // compute field balance if missing
        if (entry.fieldBalance == null) {
          entry.fieldBalance = Math.max(Number(entry.weeklyAmount || 0) - entry.fieldCollection - entry.advancePayment, 0);
        }
        // compute portions proportional to actual field collection
        const denom = Number(entry.weeklyAmount || 0);
        const factor = denom > 0 ? Math.max(Math.min(entry.fieldCollection / denom, 1), 0) : 0;
        entry.interestPortion = Math.round((expectedInterestWeekly * factor) * 100) / 100;
        entry.principalPortion = Math.round((expectedPrincipalWeekly * factor) * 100) / 100;
        // Ensure memberName for per-client loans
        if (!entry.memberName && loan.client && loan.client.memberName) {
          entry.memberName = loan.client.memberName;
        }

        loan.collections.push(entry);
        await loan.save();

        // Increment snapshot metrics for this collection event
        try {
          let grpName = '', grpCode = '';
          if (loan.group) {
            try {
              const grpDoc = await Group.findById(loan.group).select('groupName groupCode');
              if (grpDoc) {
                grpName = grpDoc.groupName || '';
                grpCode = grpDoc.groupCode || '';
              }
            } catch (_) {}
          }
          await metricService.incrementForCollection({
            loan,
            entry,
            user: req.user || null,
            groupInfo: { group: loan.group, groupName: grpName, groupCode: grpCode },
            updateSource: 'loanCollection',
          });
        } catch (e) {
          console.error('[SNAPSHOT] incrementForCollection failed', e);
        }
        // Return populated loan so UI has groupName and member names
        const populated = await Loan.findById(loan._id)
          .populate('group', 'groupName')
          .populate('client', 'memberName passBookNumber');
        res.status(201).json(populated);
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: 'Error adding collection', error: error.message });
    }
};

// Add multiple collection records (batch) to a loan
exports.addCollectionsBatch = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id).populate('client', 'memberName');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    if (loan.status !== 'active') {
      return res.status(400).json({ message: 'Cannot add collections to a loan that is not active' });
    }

    const { collections } = req.body;
    if (!Array.isArray(collections)) {
      return res.status(400).json({ message: 'collections must be an array' });
    }

    // Helper for duration conversion and expected portions
    const toWeeks = (n, unit) => {
      const num = Number(n || 0);
      switch (unit) {
        case 'days': return Math.max(Math.ceil(num / 7), 0);
        case 'weeks': return Math.max(num, 0);
        case 'months': return Math.max(num * 4, 0);
        case 'years': return Math.max(num * 52, 0);
        default: return Math.max(num, 0);
      }
    };
    const weeks = toWeeks(loan.loanDurationNumber, loan.loanDurationUnit);
    const expectedWeekly = Number(loan.weeklyInstallment || 0);
    const expectedPrincipalWeekly = (weeks > 0)
      ? Number(loan.loanAmount || 0) / weeks
      : 0;
    const expectedInterestWeekly = Math.max(expectedWeekly - expectedPrincipalWeekly, 0);

    const enrichedEntries = [];
    for (const c of collections) {
      const entry = { ...c };
      if (!entry.currency) {
        entry.currency = loan.currency;
      }
      if (entry.currency !== loan.currency) {
        return res.status(400).json({ message: `Collection currency ${entry.currency} does not match loan currency ${loan.currency}` });
      }

      entry.advancePayment = Number(entry.advancePayment || 0);
      entry.fieldCollection = Number(entry.fieldCollection || 0);
      if (!Number(entry.weeklyAmount)) entry.weeklyAmount = expectedWeekly;
      if (!Number(entry.loanAmount)) entry.loanAmount = entry.weeklyAmount;
      if (entry.fieldBalance == null) {
        entry.fieldBalance = Math.max(Number(entry.weeklyAmount || 0) - entry.fieldCollection - entry.advancePayment, 0);
      }

      const denom = Number(entry.weeklyAmount || 0);
      const factor = denom > 0 ? Math.max(Math.min(entry.fieldCollection / denom, 1), 0) : 0;
      entry.interestPortion = Math.round((expectedInterestWeekly * factor) * 100) / 100;
      entry.principalPortion = Math.round((expectedPrincipalWeekly * factor) * 100) / 100;
      if (!entry.memberName && loan.client && loan.client.memberName) {
        entry.memberName = loan.client.memberName;
      }

      loan.collections.push(entry);
      enrichedEntries.push(entry);
    }

    await loan.save();
    // Increment snapshots for all enriched entries (fire-and-forget per entry)
    try {
      let grpName = '', grpCode = '';
      if (loan.group) {
        try {
          const grpDoc = await Group.findById(loan.group).select('groupName groupCode');
          if (grpDoc) {
            grpName = grpDoc.groupName || '';
            grpCode = grpDoc.groupCode || '';
          }
        } catch (_) {}
      }
      await Promise.all((enrichedEntries || []).map((entry) =>
        metricService.incrementForCollection({
          loan,
          entry,
          user: req.user || null,
          groupInfo: { group: loan.group, groupName: grpName, groupCode: grpCode },
          updateSource: 'loanCollection',
        })
      ));
    } catch (e) {
      console.error('[SNAPSHOT] incrementForCollection(batch) failed', e);
    }
    // Return populated loan so UI has groupName and member names
    const populated = await Loan.findById(loan._id)
      .populate('group', 'groupName')
      .populate('client', 'memberName passBookNumber');
    return res.status(201).json(populated);
  } catch (error) {
    console.error(error.message);
    return res.status(400).json({ message: 'Error adding collections', error: error.message });
  }
};
