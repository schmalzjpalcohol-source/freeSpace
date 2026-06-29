const crypto = require('crypto');
const { requiredEnv } = require('../../_lib/auth');

module.exports = async function handler(req, res) {
  const clientId = requiredEnv('GITHUB_CLIENT_ID');
  const callbackUrl = requiredEnv('GITHUB_CALLBACK_URL');
  const state = crypto.randomBytes(24).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'read:user',
    state
  });

  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params.toString()}` });
  res.end();
};
