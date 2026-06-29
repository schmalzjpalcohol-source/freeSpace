const { requiredEnv, signToken } = require('../../_lib/auth');
const { supabaseFetch } = require('../../_lib/supabase');

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
  const normalizedLogin = login.toLowerCase();
  const allowed = (process.env.GITHUB_ALLOWED_USERS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  let dbUserAllowed = false;
  try {
    const users = await supabaseFetch(`app_users?github_login=eq.${encodeURIComponent(normalizedLogin)}&is_active=eq.true&select=*`);
    dbUserAllowed = users.length > 0;
  } catch (error) {
    redirect(res, `${frontendUrl}#error=auth_users_config`);
    return;
  }

  const envUserAllowed = allowed.length > 0 && allowed.includes(normalizedLogin);
  if (!dbUserAllowed && !envUserAllowed) {
    redirect(res, `${frontendUrl}#error=not_allowed`);
    return;
  }

  await supabaseFetch(`app_users?github_login=eq.${encodeURIComponent(normalizedLogin)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      display_name: githubUser.name || login,
      avatar_url: githubUser.avatar_url || '',
      last_login_at: new Date().toISOString()
    })
  });

  const token = signToken({
    sub: String(githubUser.id),
    login: normalizedLogin,
    name: githubUser.name || login,
    avatarUrl: githubUser.avatar_url || ''
  });

  redirect(res, `${frontendUrl}#token=${encodeURIComponent(token)}`);
};
