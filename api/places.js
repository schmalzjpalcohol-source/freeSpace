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

function zoneKind(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  if (text.includes('element:door') || text.includes('door outside')) return '';
  if (text.includes('element:column') || text.includes('column') || text.includes('zone:red') || text.includes('red no-place') || text.includes('blocked') || text.includes('rot') || text.includes('verbot') || text.includes('nicht abstellen')) return 'red';
  if (text.includes('element:corridor') || text.includes('corridor') || text.includes('zone:yellow') || text.includes('yellow reserve') || text.includes('gelb') || text.includes('reserve')) return 'yellow';
  return '';
}

function isDoor(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  return text.includes('element:door') || text.includes('door outside');
}

function placePayload(body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const error = new Error('Name is required.');
    error.status = 400;
    throw error;
  }

  return {
    name,
    label: name,
    location_type: body.locationType === 'floor' ? 'floor' : 'shelf',
    rows: metersToCm(body.rows, 4),
    columns: metersToCm(body.columns, 8),
    notes: String(body.notes || '').trim()
  };
}

async function packagesForPlace(id) {
  return supabaseFetch(`packages?shelf_id=eq.${encodeURIComponent(id)}&select=id,row_index,column_index,width_units,depth_units,package_name`);
}

function assertPackagesStillFit(packages, rows, columns) {
  const outside = packages.find(item => {
    const lastRow = item.row_index + (item.depth_units || 1) - 1;
    const lastColumn = item.column_index + (item.width_units || 1) - 1;
    return lastRow > rows || lastColumn > columns;
  });
  if (outside) {
    const error = new Error(`The area is too small for ${outside.package_name}.`);
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

  try {
    getUserFromRequest(req);
  } catch (error) {
    json(res, 401, { error: 'Please log in again.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const places = await supabaseFetch('shelves?select=*&order=location_type.asc,name.asc');
      const packages = await supabaseFetch('packages?select=shelf_id,width_units,depth_units,package_name,note');
      const enriched = places.map(place => {
        const placePackages = packages.filter(item => item.shelf_id === place.id);
        const usedPlaces = placePackages
          .filter(item => !zoneKind(item) && !isDoor(item))
          .reduce((sum, item) => sum + (item.width_units || 1) * (item.depth_units || 1), 0);
        const unavailablePlaces = placePackages.filter(item => !isDoor(item)).reduce((sum, item) => sum + (item.width_units || 1) * (item.depth_units || 1), 0);
        const totalPlaces = place.rows * place.columns;
        return {
          ...place,
          packageCount: placePackages.length,
          usedPlaces,
          freePlaces: Math.max(0, totalPlaces - unavailablePlaces),
          totalPlaces
        };
      });
      json(res, 200, { places: enriched });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const created = await supabaseFetch('shelves', {
        method: 'POST',
        body: JSON.stringify(placePayload(body))
      });
      json(res, 201, { place: created[0] });
      return;
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      if (!id) {
        json(res, 400, { error: 'id is required' });
        return;
      }

      const payload = placePayload(body);
      const packages = await packagesForPlace(id);
      assertPackagesStillFit(packages, payload.rows, payload.columns);

      const updated = await supabaseFetch(`shelves?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await supabaseFetch(`packages?shelf_id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ shelf_name: payload.name })
      });
      json(res, 200, { place: updated[0] });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        json(res, 400, { error: 'id is required' });
        return;
      }

      const packages = await packagesForPlace(id);
      if (packages.length) {
        json(res, 409, { error: 'The area can only be deleted after all items have been removed from it.' });
        return;
      }

      await supabaseFetch(`shelves?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Server error' });
  }
};
