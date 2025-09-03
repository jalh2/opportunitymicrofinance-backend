// Centralized list of user roles (strings are case-sensitive)
// NOTE: Keep this in sync with frontend/src/constants/roles.js

const roles = [
  // Core/admin
  'admin',

  // Executive leadership
  'board chair',
  'ceo',
  'cfo',
  'coo',
  'cro',
  'cco',
  'cmo',
  'cio',

  // Department heads
  'credit head',
  'hr head',
  'it head',
  'audit head',

  // Branch roles
  'branch manager',
  'branch accountant',

  // Operations
  'manager',
  'branch head',
  'staff',
  'field agent',
  'loan officer',
  'customer service head',
];

module.exports = { roles };
