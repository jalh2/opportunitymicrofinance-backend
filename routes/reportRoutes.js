const express = require('express');
const router = express.Router();
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { 
  createAuditReport, 
  getAuditReports, 
  getAuditReportById, 
  updateAuditReport, 
  deleteAuditReport,
  generateMonthlyAuditReport,
  generateOverdueBreakdownReport,
  generateWeeklyLoanReport,
  generateBranchMonthlySummary,
  generateBranchMonthlyShortage,
  generateMonthlyCollectionAuditReport,
  generateWeeklyCollectionReport,
  // Income Statement
  createIncomeStatement,
  listIncomeStatements,
  getIncomeStatementById,
  updateIncomeStatement,
  deleteIncomeStatement,
  // Balance Sheet
  createBalanceSheet,
  listBalanceSheets,
  getBalanceSheetById,
  updateBalanceSheet,
  deleteBalanceSheet,
  // Chart of Accounts
  createChartOfAccounts,
  listChartOfAccounts,
  getChartOfAccountsById,
  updateChartOfAccounts,
  deleteChartOfAccounts,
  listCoaAssets,
} = require('../controllers/reportController');

// All routes are protected and require authentication
router.use(identifyUserFromHeader);

// Routes accessible by admin, manager, branch head, staff, and loan officer
router.route('/')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), createAuditReport)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getAuditReports);

router.route('/generate-monthly')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateMonthlyAuditReport);

router.route('/generate-weekly-loans')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateWeeklyLoanReport);

router.route('/generate-weekly-collection')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateWeeklyCollectionReport);

router.route('/overdue-breakdown')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateOverdueBreakdownReport);

router.route('/monthly-collection-audit')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateMonthlyCollectionAuditReport);

router.route('/branch-monthly-summary')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateBranchMonthlySummary);

router.route('/branch-monthly-shortage')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateBranchMonthlyShortage);

// Income Statements CRUD
router.route('/income-statements')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), createIncomeStatement)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), listIncomeStatements);

router.route('/income-statements/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getIncomeStatementById)
  .put(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), updateIncomeStatement)
  .delete(authorizeRoles('admin'), deleteIncomeStatement);

// Balance Sheets CRUD
router.route('/balance-sheets')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), createBalanceSheet)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), listBalanceSheets);

router.route('/balance-sheets/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getBalanceSheetById)
  .put(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), updateBalanceSheet)
  .delete(authorizeRoles('admin'), deleteBalanceSheet);

// Chart of Accounts CRUD
router.route('/chart-of-accounts')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), createChartOfAccounts)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), listChartOfAccounts);

// COA helper to list assets for builder (must come before :id route)
router.route('/chart-of-accounts/assets')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), listCoaAssets);

router.route('/chart-of-accounts/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getChartOfAccountsById)
  .put(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), updateChartOfAccounts)
  .delete(authorizeRoles('admin'), deleteChartOfAccounts);

router.route('/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getAuditReportById)
  .put(authorizeRoles('admin', 'manager'), updateAuditReport)
  .delete(authorizeRoles('admin'), deleteAuditReport);

module.exports = router;
