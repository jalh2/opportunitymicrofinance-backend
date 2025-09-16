require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ensureUserIndexes } = require('./utils/ensureUserIndexes');

const app = express();

// Middleware
// Allow all origins and headers; defaults reflect requested headers
app.use(cors());
// Ensure preflight requests are handled for all routes
app.options('*', cors());
// Preserve exposure of pagination/content range headers for clients
app.use((req, res, next) => {
  res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
  next();
});
// Increase body size limits to allow base64 images from mobile app
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(req.path, req.method);
  next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/clients', require('./routes/clientRoutes'));
app.use('/api/loans', require('./routes/loanRoutes'));
app.use('/api/savings', require('./routes/savingsRoutes'));
app.use('/api/personal-savings', require('./routes/personalSavingsRoutes'));
app.use('/api/assets', require('./routes/assetRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/branch-data', require('./routes/branchDataRoutes'));
app.use('/api/branches', require('./routes/branchRoutes'));
app.use('/api/financial-summary', require('./routes/financialSummaryRoutes'));
app.use('/api/snapshots', require('./routes/snapshotRoutes'));
app.use('/api/bank-deposit-savings', require('./routes/bankDepositRoutes'));
app.use('/api/metrics', require('./routes/metricsRoutes'));

// MongoDB Connection
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    // Ensure indexes are correct (drop legacy global unique indexes if any)
    await ensureUserIndexes();
    // Listen for requests
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error.message);
  });
