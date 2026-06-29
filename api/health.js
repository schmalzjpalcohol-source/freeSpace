const { json, setCors } = require('./_lib/http');
const { supabaseFetch } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    await supabaseFetch('shelves?select=id&limit=1');
    json(res, 200, { ok: true, database: 'connected' });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message || 'Database check failed' });
  }
};
