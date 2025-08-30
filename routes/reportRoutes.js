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
  generateWeeklyCollectionReport
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

router.route('/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getAuditReportById)
  .put(authorizeRoles('admin', 'manager'), updateAuditReport)
  .delete(authorizeRoles('admin'), deleteAuditReport);

module.exports = router;
