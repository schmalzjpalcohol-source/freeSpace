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
  return Math.max(1, Number((meters * 100).toFixed(1)));
}

function cmBetween(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function packageArea(item) {
  return Math.max(1, item.width_units || 1) * Math.max(1, item.depth_units || 1);
}

function itemHeightCm(item, fallback = 45) {
  const note = String(item?.note || '');
  const match = note.match(/height\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i) || note.match(/höhe\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  return Math.max(1, numberValue(match?.[1], fallback));
}

function stackCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function zoneKind(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  if (text.includes('zone:red') || text.includes('red no-place') || text.includes('blocked') || text.includes('rot') || text.includes('verbot') || text.includes('nicht abstellen')) return 'red';
  if (text.includes('zone:yellow') || text.includes('yellow reserve') || text.includes('gelb') || text.includes('reserve')) return 'yellow';
  return '';
}

function maxStackHeightForShelf(shelf, candidate) {
  if (shelf.location_type === 'floor') return 100;
  const smallStart = 361;
  const smallColumnStart = Math.max(1, (shelf.columns || 600) - 149);
  if (
    candidate.rowIndex >= smallStart &&
    candidate.columnIndex >= smallColumnStart
  ) {
    return 16;
  }
  return 65;
}

function isZoneItem(item) {
  return Boolean(zoneKind(item));
}

function canOverlap(candidate, item) {
  const candidateZone = zoneKind({
    package_name: candidate.packageName || '',
    note: candidate.note || ''
  });
  const itemZone = zoneKind(item);
  if (candidateZone === 'red') return false;
  if (candidateZone === 'yellow') return itemZone !== 'red';
  return itemZone === 'yellow';
}

function stackTotalHeightCm(item) {
  return stackCount(item.quantity) * itemHeightCm(item);
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

  const rows = metersToCm(body.shelfRows, 4);
  const columns = metersToCm(body.shelfColumns, 8);
  const locationType = body.locationType === 'floor' ? 'floor' : 'shelf';
  const existing = await findShelf(shelfName);
  if (existing) {
    const nextRows = Math.max(existing.rows || 1, rows);
    const nextColumns = Math.max(existing.columns || 1, columns);
    if (nextRows !== existing.rows || nextColumns !== existing.columns || existing.location_type !== locationType) {
      const updated = await supabaseFetch(`shelves?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: nextRows,
          columns: nextColumns,
          location_type: locationType
        })
      });
      return updated[0] || { ...existing, rows: nextRows, columns: nextColumns, location_type: locationType };
    }
    return existing;
  }

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
    const usedPlaces = shelfPackages
      .filter(item => !isZoneItem(item))
      .reduce((sum, item) => sum + packageArea(item), 0);
    const unavailablePlaces = shelfPackages.reduce((sum, item) => sum + packageArea(item), 0);
    return {
      ...shelf,
      totalPlaces,
      usedPlaces,
      freePlaces: Math.max(0, totalPlaces - unavailablePlaces),
      packages: shelfPackages
    };
  });
}

async function assertPlaceFree(shelf, candidate, excludeId) {
  if (candidate.rowIndex + candidate.depthUnits - 1 > shelf.rows || candidate.columnIndex + candidate.widthUnits - 1 > shelf.columns) {
    const error = new Error('The item does not fit in this area.');
    error.status = 400;
    throw error;
  }

  const shelfPackages = await supabaseFetch(`packages?shelf_id=eq.${shelf.id}&select=id,row_index,column_index,width_units,depth_units,package_name,quantity,note`);
  const overlappingPackages = shelfPackages.filter(item => (
    item.id !== excludeId &&
    overlaps(candidate, packageRect(item))
  ));
  const candidateZone = zoneKind({ package_name: candidate.packageName, note: candidate.note });
  const collision = overlappingPackages.find(item => {
    if (!candidateZone && !isZoneItem(item)) return false;
    return !canOverlap(candidate, item);
  });
  if (collision) {
    const error = new Error(`This area is already occupied by ${collision.package_name}.`);
    error.status = 409;
    throw error;
  }

  if (!candidateZone) {
    const totalHeight = stackCount(candidate.quantity) * itemHeightCm(candidate);
    const maxHeight = maxStackHeightForShelf(shelf, candidate);
    const overlapHeight = overlappingPackages
      .filter(item => !isZoneItem(item))
      .reduce((sum, item) => sum + stackTotalHeightCm(item), 0);
    const combinedHeight = totalHeight + overlapHeight;
    if (combinedHeight > maxHeight) {
      const error = new Error(`Stack is too high: ${combinedHeight} cm, max ${maxHeight} cm here.`);
      error.status = 400;
      throw error;
    }
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
      const quantity = intBetween(body.quantity, 1, 9999, 1);
      const note = String(body.note || '').trim();

      if (!packageName) {
        json(res, 400, { error: 'packageName is required' });
        return;
      }

      await assertPlaceFree(shelf, { rowIndex, columnIndex, widthUnits, depthUnits, packageName, quantity, note });

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
          quantity,
          note,
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
      const quantity = intBetween(body.quantity, 1, 9999, 1);
      const note = String(body.note || '').trim();

      if (!packageName) {
        json(res, 400, { error: 'packageName is required' });
        return;
      }

      await assertPlaceFree(shelf, { rowIndex, columnIndex, widthUnits, depthUnits, packageName, quantity, note }, id);

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
          quantity,
          note,
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
