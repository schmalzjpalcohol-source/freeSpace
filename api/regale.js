const { getUserFromRequest } = require('./_lib/auth');
const { json, readBody, setCors } = require('./_lib/http');
const { supabaseFetch } = require('./_lib/supabase');

function intBetween(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function findShelf(name) {
  const encoded = encodeURIComponent(name);
  const shelves = await supabaseFetch(`shelves?name=eq.${encoded}&select=*`);
  return shelves[0] || null;
}

async function ensureShelf(body) {
  const shelfName = String(body.shelfName || '').trim();
  if (!shelfName) {
    const error = new Error('shelfName is required');
    error.status = 400;
    throw error;
  }

  const existing = await findShelf(shelfName);
  if (existing) return existing;

  const rows = intBetween(body.shelfRows, 1, 12, 4);
  const columns = intBetween(body.shelfColumns, 1, 20, 8);
  const created = await supabaseFetch('shelves', {
    method: 'POST',
    body: JSON.stringify({
      name: shelfName,
      label: shelfName,
      rows,
      columns,
      notes: ''
    })
  });
  return created[0];
}

function buildOverview(shelves, packages) {
  return shelves.map(shelf => {
    const shelfPackages = packages.filter(item => item.shelf_id === shelf.id);
    const totalPlaces = shelf.rows * shelf.columns;
    return {
      ...shelf,
      totalPlaces,
      usedPlaces: shelfPackages.length,
      freePlaces: totalPlaces - shelfPackages.length,
      packages: shelfPackages
    };
  });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  let user;
  try {
    user = getUserFromRequest(req);
  } catch (error) {
    json(res, 401, { error: 'Please log in again.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const shelves = await supabaseFetch('shelves?select=*&order=name.asc');
      const packages = await supabaseFetch('packages?select=*&order=shelf_name.asc,row_index.asc,column_index.asc,created_at.asc');
      json(res, 200, { shelves: buildOverview(shelves, packages), user });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const shelf = await ensureShelf(body);
      const rowIndex = intBetween(body.rowIndex, 1, shelf.rows, 1);
      const columnIndex = intBetween(body.columnIndex, 1, shelf.columns, 1);
      const packageName = String(body.packageName || '').trim();

      if (!packageName) {
        json(res, 400, { error: 'packageName is required' });
        return;
      }

      const occupied = await supabaseFetch(
        `packages?shelf_id=eq.${shelf.id}&row_index=eq.${rowIndex}&column_index=eq.${columnIndex}&select=id,package_name`
      );
      if (occupied.length) {
        json(res, 409, { error: 'This place is already occupied.', occupiedBy: occupied[0] });
        return;
      }

      const inserted = await supabaseFetch('packages', {
        method: 'POST',
        body: JSON.stringify({
          shelf_id: shelf.id,
          shelf_name: shelf.name,
          row_index: rowIndex,
          column_index: columnIndex,
          package_name: packageName,
          quantity: intBetween(body.quantity, 1, 9999, 1),
          note: String(body.note || '').trim(),
          created_by: user.sub,
          created_by_login: user.login
        })
      });
      json(res, 201, { package: inserted[0] });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        json(res, 400, { error: 'id is required' });
        return;
      }
      await supabaseFetch(`packages?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Server error' });
  }
};
