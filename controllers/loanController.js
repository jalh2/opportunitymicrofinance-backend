const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const Client = require('../models/Client');
const Group = require('../models/Group');
const snapshotService = require('../services/snapshotService');
const SavingsAccount = require('../models/Savings');

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
      await snapshotService.incrementMetrics({
        branchName: loan.branchName,
        branchCode: loan.branchCode,
        currency: loan.currency,
        date: new Date(),
        inc: {
          totalAppraisalFees: appraisalFee,
          totalPendingLoanAmount: principal,
        },
        // audit/context
        group: loan.group,
        groupName: groupData.groupName,
        groupCode: groupData.groupCode,
        updatedBy: req.user && req.user.id ? req.user.id : null,
        updatedByName: req.user && req.user.username ? req.user.username : '',
        updatedByEmail: req.user && req.user.email ? req.user.email : '',
        updateSource: 'loanCreate',
      });
    } catch (e) {
      console.error('[SNAPSHOT] increment on loan create failed', e);
    }
    // If loan is created already active, increment snapshot for approval day
    try {
      if (status === 'active') {
        await snapshotService.incrementForLoanApproval({
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
        // Also auto-deposit security deposit into group's savings account
        const security = Number(loan.securityDeposit || 0);
        if (security > 0) {
          const groupId = loan.group;
          let account = await SavingsAccount.findOne({ group: groupId });
          if (!account) {
            account = new SavingsAccount({
              group: groupId,
              currency: loan.currency || 'LRD',
            });
          }
          if (!account.currency) {
            account.currency = loan.currency || 'LRD';
          }
          const depositDate = new Date();
          const deposit = security;
          const newBalance = Number(account.currentBalance || 0) + deposit;
          account.transactions.push({
            date: depositDate,
            savingAmount: deposit,
            withdrawalAmount: 0,
            balance: newBalance,
            currency: account.currency || 'LRD',
            type: 'security',
          });
          account.currentBalance = newBalance;
          await account.save();

          try {
            await snapshotService.incrementMetrics({
              branchName: loan.branchName,
              branchCode: loan.branchCode,
              currency: account.currency || 'LRD',
              date: depositDate,
              inc: {
                totalSavingsDeposits: deposit,
                netSavingsFlow: deposit,
                totalSavingsBalance: deposit,
                totalSecurityDepositsFlow: deposit,
                totalSecuritySavingsBalance: deposit,
              },
              group: groupId,
              groupName: groupData.groupName || '',
              groupCode: groupData.groupCode || '',
              updatedBy: (req.user && req.user.id) || null,
              updatedByName: (req.user && req.user.username) || '',
              updatedByEmail: (req.user && req.user.email) || '',
              updateSource: 'securityDepositOnApproval',
            });
          } catch (e2) {
            console.error('[SNAPSHOT] security deposit increment (create) failed', e2);
          }
        }
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

// Update loan status (e.g., approve -> active) and compute weekly per-member installment on approval
exports.setLoanStatus = async (req, res) => {
  try {
    const { status } = req.body; // expected one of ['pending','active','paid','defaulted']
    const allowed = ['pending', 'active', 'paid', 'defaulted'];
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
        await snapshotService.incrementForLoanApproval({
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
      }
    } catch (e) {
      console.error('[SNAPSHOT] incrementForLoanApproval (status change) failed', e);
    }
    // Auto-deposit security deposit into group's savings account on activation
    try {
      if (prevStatus !== 'active' && status === 'active') {
        const security = Number(loan.securityDeposit || 0);
        if (security > 0) {
          const groupId = (loan.group && loan.group._id) ? loan.group._id : loan.group;
          let account = await SavingsAccount.findOne({ group: groupId });
          if (!account) {
            account = new SavingsAccount({
              group: groupId,
              currency: loan.currency || 'LRD',
            });
          }
          if (!account.currency) {
            account.currency = loan.currency || 'LRD';
          }
          const depositDate = new Date();
          const deposit = security;
          const newBalance = Number(account.currentBalance || 0) + deposit;
          account.transactions.push({
            date: depositDate,
            savingAmount: deposit,
            withdrawalAmount: 0,
            balance: newBalance,
            currency: account.currency || 'LRD',
            type: 'security',
          });
          account.currentBalance = newBalance;
          await account.save();

          // Update financial snapshots for this security deposit
          try {
            const grp = loan.group;
            await snapshotService.incrementMetrics({
              branchName: loan.branchName,
              branchCode: loan.branchCode,
              currency: account.currency || 'LRD',
              date: depositDate,
              inc: {
                totalSavingsDeposits: deposit,
                netSavingsFlow: deposit,
                totalSavingsBalance: deposit,
                totalSecurityDepositsFlow: deposit,
                totalSecuritySavingsBalance: deposit,
              },
              // audit/context
              group: groupId,
              groupName: (grp && grp.groupName) || '',
              groupCode: (grp && grp.groupCode) || '',
              updatedBy: (req.user && req.user.id) || null,
              updatedByName: (req.user && req.user.username) || '',
              updatedByEmail: (req.user && req.user.email) || '',
              updateSource: 'securityDepositOnApproval',
            });
          } catch (e2) {
            console.error('[SNAPSHOT] security deposit increment failed', e2);
          }
        }
      }
    } catch (e) {
      console.error('[SECURITY_DEPOSIT] auto deposit on approval failed', e);
    }
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
          await snapshotService.incrementForCollection({
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
        snapshotService.incrementForCollection({
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
