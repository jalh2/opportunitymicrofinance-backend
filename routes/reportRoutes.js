const express = require('express');
const router = express.Router();
const { identifyUserFromHeader, authorizeRoles } = require('../middleware/authMiddleware');
const { 
  createAuditReport, 
  getAuditReports, 
  getAuditReportById, 
  updateAuditReport, 
  deleteAuditReport,
  generateMonthlyAuditReport
} = require('../controllers/reportController');

// All routes are protected and require authentication
router.use(identifyUserFromHeader);

// Routes accessible by admin, manager, branch head, staff, and loan officer
router.route('/')
  .post(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), createAuditReport)
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getAuditReports);

router.route('/generate-monthly')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), generateMonthlyAuditReport);

router.route('/:id')
  .get(authorizeRoles('admin', 'manager', 'branch head', 'staff', 'loan officer'), getAuditReportById)
  .put(authorizeRoles('admin', 'manager'), updateAuditReport)
  .delete(authorizeRoles('admin'), deleteAuditReport);

module.exports = router;
