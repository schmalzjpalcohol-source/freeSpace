const crypto = require('crypto');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decodeBase64url(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24 * 14
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(tokenPayload))}`;
  const signature = crypto
    .createHmac('sha256', requiredEnv('JWT_SECRET'))
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsigned}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) throw new Error('Missing token');
  const [header, payload, signature] = token.split('.');
  const unsigned = `${header}.${payload}`;
  const expected = crypto
    .createHmac('sha256', requiredEnv('JWT_SECRET'))
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Invalid token');
  }

  const data = JSON.parse(decodeBase64url(payload));
  if (data.exp && data.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return data;
}

function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return verifyToken(token);
}

module.exports = { getUserFromRequest, requiredEnv, signToken };
