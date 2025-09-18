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
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), createAuditReport)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), getAuditReports);

router.route('/generate-monthly')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateMonthlyAuditReport);

router.route('/generate-weekly-loans')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateWeeklyLoanReport);

router.route('/generate-weekly-collection')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateWeeklyCollectionReport);

router.route('/overdue-breakdown')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateOverdueBreakdownReport);

router.route('/monthly-collection-audit')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateMonthlyCollectionAuditReport);

router.route('/branch-monthly-summary')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateBranchMonthlySummary);

router.route('/branch-monthly-shortage')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), generateBranchMonthlyShortage);

// Income Statements CRUD
router.route('/income-statements')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), createIncomeStatement)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), listIncomeStatements);

router.route('/income-statements/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), getIncomeStatementById)
  .put(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), updateIncomeStatement)
  .delete(authorizeRoles('admin', 'board chair', 'board chairman'), deleteIncomeStatement);

// Balance Sheets CRUD
router.route('/balance-sheets')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), createBalanceSheet)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), listBalanceSheets);

router.route('/balance-sheets/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), getBalanceSheetById)
  .put(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), updateBalanceSheet)
  .delete(authorizeRoles('admin', 'board chair', 'board chairman'), deleteBalanceSheet);

// Chart of Accounts CRUD
router.route('/chart-of-accounts')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), createChartOfAccounts)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), listChartOfAccounts);

// COA helper to list assets for builder (must come before :id route)
router.route('/chart-of-accounts/assets')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), listCoaAssets);

router.route('/chart-of-accounts/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), getChartOfAccountsById)
  .put(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), updateChartOfAccounts)
  .delete(authorizeRoles('admin', 'board chair', 'board chairman'), deleteChartOfAccounts);

router.route('/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer', 'board chair', 'board chairman'), getAuditReportById)
  .put(authorizeRoles('admin', 'manager', 'board chair', 'board chairman'), updateAuditReport)
  .delete(authorizeRoles('admin', 'board chair', 'board chairman'), deleteAuditReport);

module.exports = router;
