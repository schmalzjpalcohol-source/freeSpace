const { requiredEnv } = require('./auth');

function supabaseBase() {
  return requiredEnv('SUPABASE_URL').replace(/\/$/, '');
}

async function supabaseFetch(path, options = {}) {
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBase()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data && data.message ? data.message : response.statusText;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

module.exports = { supabaseFetch };
