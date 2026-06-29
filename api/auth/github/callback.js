const { requiredEnv, signToken } = require('../../_lib/auth');

function readCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function redirect(res, url) {
  res.writeHead(302, {
    Location: url,
    'Set-Cookie': 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
  });
  res.end();
}

module.exports = async function handler(req, res) {
  const frontendUrl = requiredEnv('FRONTEND_URL');
  const { code, state } = req.query;
  const expectedState = readCookie(req, 'oauth_state');

  if (!code || !state || state !== expectedState) {
    redirect(res, `${frontendUrl}#error=oauth_state`);
    return;
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: requiredEnv('GITHUB_CLIENT_ID'),
      client_secret: requiredEnv('GITHUB_CLIENT_SECRET'),
      code,
      redirect_uri: requiredEnv('GITHUB_CALLBACK_URL')
    })
  });
  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    redirect(res, `${frontendUrl}#error=github_token`);
    return;
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'freeSpace'
    }
  });
  const githubUser = await userResponse.json();
  const login = githubUser.login || '';
  const allowed = (process.env.GITHUB_ALLOWED_USERS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length && !allowed.includes(login.toLowerCase())) {
    redirect(res, `${frontendUrl}#error=not_allowed`);
    return;
  }

  const token = signToken({
    sub: String(githubUser.id),
    login,
    name: githubUser.name || login,
    avatarUrl: githubUser.avatar_url || ''
  });

  redirect(res, `${frontendUrl}#token=${encodeURIComponent(token)}`);
};
