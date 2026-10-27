const { verifyAccessToken } = require('../utils/tokens');

function authenticate(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: 'You do not have permission to do that' });

// Cookie-authenticated endpoints must carry a custom header. Browsers will not
// add it on cross-site form posts, which blocks CSRF (on top of SameSite=Strict).
function requireCustomHeader(req, res, next) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'Missing required header' });
  }
  next();
}

module.exports = { authenticate, requireRole, requireCustomHeader };
