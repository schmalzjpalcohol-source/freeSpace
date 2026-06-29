const { requiredEnv, signToken } = require('../_lib/auth');
const { json, readBody, setCors } = require('../_lib/http');
const { supabaseFetch } = require('../_lib/supabase');
const crypto = require('crypto');

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    requiredEnv('JWT_SECRET');
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!username || !password) {
      json(res, 400, { error: 'invalid_login' });
      return;
    }

    const users = await supabaseFetch(`app_users?username=eq.${encodeURIComponent(username)}&is_active=eq.true&select=id,username,display_name,password_salt,password_hash`);
    const user = users[0];
    if (!user || hashPassword(password, user.password_salt) !== user.password_hash) {
      json(res, 401, { error: 'invalid_login' });
      return;
    }

    await supabaseFetch(`app_users?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_login_at: new Date().toISOString() })
    });

    const token = signToken({
      sub: user.id,
      login: user.username,
      name: user.display_name || user.username
    });

    json(res, 200, {
      token,
      user: {
        login: user.username,
        name: user.display_name || user.username
      }
    });
  } catch (error) {
    json(res, 500, { error: error.status === 404 ? 'auth_config' : error.message || 'Server error' });
  }
};
