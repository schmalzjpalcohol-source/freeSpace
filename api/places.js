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

function localizedNumberValue(value, fallback) {
  const text = String(value ?? '').trim();
  const normalized = text.includes(',')
    ? text.replaceAll('.', '').replace(',', '.')
    : /\.\d{3}(?:\D|$)/.test(text)
      ? text.replaceAll('.', '')
      : text;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function metersToCm(value, fallbackMeters, maxMeters = 1000) {
  const meters = Math.max(0.0001, Math.min(maxMeters, numberValue(value, fallbackMeters)));
  return Math.max(0.01, Number((meters * 100).toFixed(2)));
}

function zoneKind(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  if (text.includes('element:door') || text.includes('door outside') || /\bdoor\b/.test(text)) return '';
  if (text.includes('element:column') || text.includes('column') || text.includes('zone:red') || text.includes('red no-place') || text.includes('blocked') || text.includes('rot') || text.includes('verbot') || text.includes('nicht abstellen')) return 'red';
  if (text.includes('element:corridor') || text.includes('corridor') || text.includes('zone:yellow') || text.includes('yellow reserve') || text.includes('gelb') || text.includes('reserve')) return 'yellow';
  return '';
}

function isDoor(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  return text.includes('element:door') || text.includes('door outside') || /\bdoor\b/.test(text);
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

async function packagesForPlace(id, ownerId) {
  return supabaseFetch(`packages?shelf_id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id,row_index,column_index,width_units,depth_units,package_name,quantity,note`);
}

function areaMaxHeightCm(notes, fallback = 220) {
  const text = String(notes || '');
  const marker = text.match(/max-height-mm\s*:\s*([0-9.,]+)/i);
  if (marker) return Math.max(0.1, localizedNumberValue(marker[1], fallback * 10) / 10);
  const mm = text.match(/max(?:imum)?\s*height\s*([0-9.,]+)\s*mm/i);
  if (mm) return Math.max(0.1, localizedNumberValue(mm[1], fallback * 10) / 10);
  const cm = text.match(/max(?:imum)?\s*height\s*([0-9.,]+)\s*cm/i);
  return cm ? Math.max(0.1, localizedNumberValue(cm[1], fallback)) : fallback;
}

function rackLayoutFromNotes(notes) {
  const encoded = String(notes || '').match(/rack-layout\s*:\s*([^;,\s]+)/i)?.[1];
  if (!encoded) return [];
  try {
    const levels = JSON.parse(decodeURIComponent(encoded));
    let nextRow = 1;
    return [...levels].sort((a, b) => (Number(a.slot) || 0) - (Number(b.slot) || 0)).map(level => {
      const depth = Math.max(0.1, numberValue(level.depth, 90));
      const start = nextRow;
      const range = {
        start,
        end: start + depth - 1,
        width: Math.max(0.1, numberValue(level.width, 600)),
        height: Math.max(0.1, numberValue(level.height, 65))
      };
      nextRow = range.end + 1;
      return range;
    });
  } catch (error) {
    return [];
  }
}

function itemHeightCm(item, fallback = 45) {
  const match = String(item.note || '').match(/height\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  return Math.max(0.1, numberValue(match?.[1], fallback));
}

function stackCount(item) {
  const count = Number.parseInt(item.quantity, 10);
  return Number.isFinite(count) ? Math.max(1, count) : 1;
}

function noteWithHeight(note, height) {
  const clean = String(note || '').replace(/(?:,\s*)?height\s*[0-9]+(?:[.,][0-9]+)?\s*cm/gi, '').replace(/^,\s*|\s*,$/g, '').trim();
  return `${clean ? `${clean}, ` : ''}height ${height} cm`;
}

function assertPackagesHeightFit(packages, place) {
  if (place.location_type !== 'floor') return;
  const maxHeight = areaMaxHeightCm(place.notes, 220);
  const items = packages.filter(item => !zoneKind(item) && !isDoor(item)).map(item => ({
    item,
    left: item.column_index,
    right: item.column_index + (item.width_units || 1),
    top: item.row_index,
    bottom: item.row_index + (item.depth_units || 1),
    height: stackCount(item) * itemHeightCm(item)
  }));
  const xEdges = [...new Set(items.flatMap(item => [item.left, item.right]))].sort((a, b) => a - b);
  const yEdges = [...new Set(items.flatMap(item => [item.top, item.bottom]))].sort((a, b) => a - b);
  for (let x = 0; x < xEdges.length - 1; x += 1) {
    for (let y = 0; y < yEdges.length - 1; y += 1) {
      const midpointX = (xEdges[x] + xEdges[x + 1]) / 2;
      const midpointY = (yEdges[y] + yEdges[y + 1]) / 2;
      const occupiedHeight = items
        .filter(item => midpointX >= item.left && midpointX < item.right && midpointY >= item.top && midpointY < item.bottom)
        .reduce((sum, item) => sum + item.height, 0);
      if (occupiedHeight > maxHeight) {
        const error = new Error('The new maximum height is lower than an existing stack.');
        error.status = 409;
        throw error;
      }
    }
  }
}

function assertPackagesFitCustomRack(packages, place) {
  const levels = rackLayoutFromNotes(place.notes);
  if (!levels.length) return;
  const normalItems = packages.filter(item => !zoneKind(item) && !isDoor(item));
  for (const item of packages.filter(item => !isDoor(item))) {
    const right = item.column_index + (item.width_units || 1) - 1;
    const bottom = item.row_index + (item.depth_units || 1) - 1;
    const level = levels.find(candidate => item.row_index >= candidate.start && bottom <= candidate.end && right <= candidate.width);
    if (!level) {
      const error = new Error(`${item.package_name} does not fit inside the new sub-rack layout.`);
      error.status = 409;
      throw error;
    }
    if (zoneKind(item)) continue;
    const occupiedHeight = normalItems
      .filter(other => (
        item.column_index < other.column_index + (other.width_units || 1) &&
        item.column_index + (item.width_units || 1) > other.column_index &&
        item.row_index < other.row_index + (other.depth_units || 1) &&
        item.row_index + (item.depth_units || 1) > other.row_index
      ))
      .reduce((sum, other) => sum + stackTotalHeightCm(other), 0);
    if (occupiedHeight > level.height) {
      const error = new Error(`The new sub-rack height is lower than the stack containing ${item.package_name}.`);
      error.status = 409;
      throw error;
    }
  }
}

async function syncZoneHeights(packages, place, ownerId) {
  for (const item of packages.filter(zoneKind)) {
    const customLevel = rackLayoutFromNotes(place.notes).find(level => item.row_index >= level.start && item.row_index <= level.end && item.column_index <= level.width);
    const structuredRack = !customLevel && place.location_type !== 'floor' && Math.abs((place.rows || 0) - 450) <= 2 && Math.abs((place.columns || 0) - 600) <= 2;
    const smallRack = structuredRack && item.row_index >= 361 && item.column_index >= Math.max(1, place.columns - 149);
    const maxHeight = customLevel?.height || (smallRack ? 16 : areaMaxHeightCm(place.notes, place.location_type === 'floor' ? 220 : 65));
    await supabaseFetch(`packages?id=eq.${encodeURIComponent(item.id)}&owner_id=eq.${encodeURIComponent(ownerId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ note: noteWithHeight(item.note, Math.min(itemHeightCm(item, maxHeight), maxHeight)) })
    });
  }
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

  let user;
  try {
    user = getUserFromRequest(req);
  } catch (error) {
    json(res, 401, { error: 'Please log in again.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const ownerId = encodeURIComponent(user.sub);
      const places = await supabaseFetch(`shelves?owner_id=eq.${ownerId}&select=*&order=location_type.asc,name.asc`);
      const packages = await supabaseFetch(`packages?owner_id=eq.${ownerId}&select=shelf_id,width_units,depth_units,package_name,note`);
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
        body: JSON.stringify({ ...placePayload(body), owner_id: user.sub })
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
      const packages = await packagesForPlace(id, user.sub);
      assertPackagesStillFit(packages, payload.rows, payload.columns);
      assertPackagesHeightFit(packages, payload);
      assertPackagesFitCustomRack(packages, payload);

      const updated = await supabaseFetch(`shelves?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.sub)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      if (!updated.length) {
        json(res, 404, { error: 'The selected area no longer exists.' });
        return;
      }
      await supabaseFetch(`packages?shelf_id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.sub)}`, {
        method: 'PATCH',
        body: JSON.stringify({ shelf_name: payload.name })
      });
      await syncZoneHeights(packages, payload, user.sub);
      json(res, 200, { place: updated[0] });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        json(res, 400, { error: 'id is required' });
        return;
      }

      const packages = await packagesForPlace(id, user.sub);
      if (packages.length) {
        json(res, 409, { error: 'The area can only be deleted after all items have been removed from it.' });
        return;
      }

      const deleted = await supabaseFetch(`shelves?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.sub)}`, { method: 'DELETE' });
      if (!deleted.length) {
        json(res, 404, { error: 'The selected area no longer exists.' });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Server error' });
  }
};
