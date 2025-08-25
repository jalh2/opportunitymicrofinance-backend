const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = 'your_jwt_secret_key'; // In production, use an environment variable!

// Legacy token-based protector (kept for compatibility, not used per current requirements)
const tokenProtect = function(req, res, next) {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Role-based identification and authorization without tokens
// Identify user based on email provided in headers or query/body, then attach req.user
// WARNING: This is not secure and is used per project requirements (no token auth)
const identifyUserFromHeader = async (req, res, next) => {
  try {
    const email = req.header('x-user-email');
    console.log('[AUTH] identifyUserFromHeader start', {
      path: req.path,
      method: req.method,
      emailHeaderPresent: !!email,
      headers: {
        'x-user-email': email,
        authorization: req.header('authorization') ? '[present]' : '[absent]'
      }
    });
    if (!email) {
      console.warn('[AUTH] Missing x-user-email header');
      return res.status(400).json({ message: 'User email is required in x-user-email header' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.warn('[AUTH] No user found for email', email);
      return res.status(404).json({ message: 'User not found for provided email' });
    }
    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      username: user.username,
    };
    console.log('[AUTH] identifyUserFromHeader success', { userId: req.user.id, role: req.user.role });
    next();
  } catch (err) {
    console.error('[AUTH] identifyUserFromHeader error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Authorize based on role(s)
const authorizeRoles = (...roles) => (req, res, next) => {
  console.log('[AUTH] authorizeRoles check', { required: roles, user: req.user ? { id: req.user.id, role: req.user.role } : null, path: req.path, method: req.method });
  if (!req.user || !req.user.role) {
    console.warn('[AUTH] authorizeRoles: user not identified');
    return res.status(401).json({ message: 'User not identified' });
  }
  if (!roles.includes(req.user.role)) {
    console.warn('[AUTH] authorizeRoles: access denied', { userRole: req.user.role, required: roles });
    return res.status(403).json({ message: 'Access denied: insufficient role' });
  }
  console.log('[AUTH] authorizeRoles: allowed');
  next();
};

module.exports = { tokenProtect, identifyUserFromHeader, authorizeRoles };
