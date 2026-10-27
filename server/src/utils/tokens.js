const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const ISSUER = 'secure-auth-platform';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, config.jwtAccessSecret, {
    subject: user.id,
    expiresIn: config.accessTtl,
    algorithm: 'HS256',
    issuer: ISSUER,
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'], issuer: ISSUER });

module.exports = { sha256, randomToken, signAccessToken, verifyAccessToken };
