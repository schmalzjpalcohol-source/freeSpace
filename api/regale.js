const { getUserFromRequest } = require('./_lib/auth');
const { json, readBody, setCors } = require('./_lib/http');
const { supabaseFetch } = require('./_lib/supabase');

function intBetween(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function numberValue(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function metersToCm(value, fallbackMeters, maxMeters = 1000) {
  const meters = Math.max(0.01, Math.min(maxMeters, numberValue(value, fallbackMeters)));
  return Math.max(1, Math.round(meters * 100));
}

function cmBetween(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function packageArea(item) {
  return Math.max(1, item.width_units || 1) * Math.max(1, item.depth_units || 1);
}

function overlaps(a, b) {
  return (
    a.columnIndex < b.columnIndex + b.widthUnits &&
    a.columnIndex + a.widthUnits > b.columnIndex &&
    a.rowIndex < b.rowIndex + b.depthUnits &&
    a.rowIndex + a.depthUnits > b.rowIndex
  );
}

function packageRect(item) {
  return {
    id: item.id,
    rowIndex: item.row_index,
    columnIndex: item.column_index,
    widthUnits: item.width_units || 1,
    depthUnits: item.depth_units || 1
  };
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

  const rows = metersToCm(body.shelfRows, 4);
  const columns = metersToCm(body.shelfColumns, 8);
  const locationType = body.locationType === 'floor' ? 'floor' : 'shelf';
  const created = await supabaseFetch('shelves', {
    method: 'POST',
    body: JSON.stringify({
      name: shelfName,
      label: shelfName,
      location_type: locationType,
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
    const usedPlaces = shelfPackages.reduce((sum, item) => sum + packageArea(item), 0);
    return {
      ...shelf,
      totalPlaces,
      usedPlaces,
      freePlaces: Math.max(0, totalPlaces - usedPlaces),
      packages: shelfPackages
    };
  });
}

async function assertPlaceFree(shelf, candidate, excludeId) {
  if (candidate.rowIndex + candidate.depthUnits - 1 > shelf.rows || candidate.columnIndex + candidate.widthUnits - 1 > shelf.columns) {
    const error = new Error('Die Packung passt nicht in diesen Bereich.');
    error.status = 400;
    throw error;
  }

  const shelfPackages = await supabaseFetch(`packages?shelf_id=eq.${shelf.id}&select=id,row_index,column_index,width_units,depth_units,package_name`);
  const collision = shelfPackages.find(item => item.id !== excludeId && overlaps(candidate, packageRect(item)));
  if (collision) {
    const error = new Error(`Dieser Bereich ist schon belegt von ${collision.package_name}.`);
    error.status = 409;
    throw error;
  }
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
      const widthUnits = metersToCm(body.widthUnits, 1, shelf.columns / 100);
      const depthUnits = metersToCm(body.depthUnits, 1, shelf.rows / 100);
      const rowIndex = cmBetween(body.rowIndex, 1, Math.max(1, shelf.rows - depthUnits + 1), 1);
      const columnIndex = cmBetween(body.columnIndex, 1, Math.max(1, shelf.columns - widthUnits + 1), 1);
      const packageName = String(body.packageName || '').trim();

      if (!packageName) {
        json(res, 400, { error: 'packageName is required' });
        return;
      }

      await assertPlaceFree(shelf, { rowIndex, columnIndex, widthUnits, depthUnits });

      const inserted = await supabaseFetch('packages', {
        method: 'POST',
        body: JSON.stringify({
          shelf_id: shelf.id,
          shelf_name: shelf.name,
          row_index: rowIndex,
          column_index: columnIndex,
          width_units: widthUnits,
          depth_units: depthUnits,
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

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = String(body.packageId || '').trim();
      if (!id) {
        json(res, 400, { error: 'packageId is required' });
        return;
      }

      const shelf = await ensureShelf(body);
      const widthUnits = metersToCm(body.widthUnits, 1, shelf.columns / 100);
      const depthUnits = metersToCm(body.depthUnits, 1, shelf.rows / 100);
      const rowIndex = cmBetween(body.rowIndex, 1, Math.max(1, shelf.rows - depthUnits + 1), 1);
      const columnIndex = cmBetween(body.columnIndex, 1, Math.max(1, shelf.columns - widthUnits + 1), 1);
      const packageName = String(body.packageName || '').trim();

      if (!packageName) {
        json(res, 400, { error: 'packageName is required' });
        return;
      }

      await assertPlaceFree(shelf, { rowIndex, columnIndex, widthUnits, depthUnits }, id);

      const updated = await supabaseFetch(`packages?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          shelf_id: shelf.id,
          shelf_name: shelf.name,
          row_index: rowIndex,
          column_index: columnIndex,
          width_units: widthUnits,
          depth_units: depthUnits,
          package_name: packageName,
          quantity: intBetween(body.quantity, 1, 9999, 1),
          note: String(body.note || '').trim(),
          updated_at: new Date().toISOString()
        })
      });
      json(res, 200, { package: updated[0] });
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
