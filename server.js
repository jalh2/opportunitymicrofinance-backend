require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
    'x-user-email',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));
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

// MongoDB Connection
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Listen for requests
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error.message);
  });

