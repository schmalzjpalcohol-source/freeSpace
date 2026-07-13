const tokenKey = 'freespace_token';
const els = {
  loginForm: document.querySelector('#loginForm'),
  logoutButton: document.querySelector('#logoutButton'),
  refreshButton: document.querySelector('#refreshButton'),
  view3dButton: document.querySelector('#view3dButton'),
  defaultPlanButton: document.querySelector('#defaultPlanButton'),
  packagesTab: document.querySelector('#packagesTab'),
  placesTab: document.querySelector('#placesTab'),
  userLabel: document.querySelector('#userLabel'),
  setupPanel: document.querySelector('#setupPanel'),
  message: document.querySelector('#message'),
  loginView: document.querySelector('#loginView'),
  appView: document.querySelector('#appView'),
  packageView: document.querySelector('#packageView'),
  placeView: document.querySelector('#placeView'),
  placeForm: document.querySelector('#placeForm'),
  placeId: document.querySelector('#placeId'),
  placeLocationType: document.querySelector('#placeLocationType'),
  placeName: document.querySelector('#placeName'),
  placeRows: document.querySelector('#placeRows'),
  placeColumns: document.querySelector('#placeColumns'),
  placeNotes: document.querySelector('#placeNotes'),
  placeList: document.querySelector('#placeList'),
  savePlaceButton: document.querySelector('#savePlaceButton'),
  cancelPlaceButton: document.querySelector('#cancelPlaceButton'),
  deleteAllPlacesButton: document.querySelector('#deleteAllPlacesButton'),
  resetPlanButton: document.querySelector('#resetPlanButton'),
  shelves: document.querySelector('#shelves'),
  summaryText: document.querySelector('#summaryText'),
  packageForm: document.querySelector('#packageForm'),
  formTitle: document.querySelector('#formTitle'),
  packageId: document.querySelector('#packageId'),
  selectedCell: document.querySelector('#selectedCell'),
  locationType: document.querySelector('#locationType'),
  overviewCards: document.querySelector('#overviewCards'),
  warehouseMap: document.querySelector('#warehouseMap'),
  model3d: document.querySelector('#model3d'),
  shelfName: document.querySelector('#shelfName'),
  shelfRows: document.querySelector('#shelfRows'),
  shelfColumns: document.querySelector('#shelfColumns'),
  rowIndex: document.querySelector('#rowIndex'),
  columnIndex: document.querySelector('#columnIndex'),
  widthUnits: document.querySelector('#widthUnits'),
  depthUnits: document.querySelector('#depthUnits'),
  heightUnits: document.querySelector('#heightUnits'),
  packageName: document.querySelector('#packageName'),
  quantity: document.querySelector('#quantity'),
  note: document.querySelector('#note'),
  saveButton: document.querySelector('#saveButton'),
  deletePackageButton: document.querySelector('#deletePackageButton'),
  cancelEditButton: document.querySelector('#cancelEditButton')
};

let appState = {
  token: localStorage.getItem(tokenKey) || '',
  user: null,
  shelves: [],
  selected: null,
  activeView: 'packages',
  activePlanRole: 'floor-main',
  activeRackLevel: 1,
  measurement: null,
  model3d: {
    active: false,
    zoom: 1,
    views: {}
  }
};

const planPlaces = {
  'floor-main': {
    title: 'Floor area 1 - 880 x 380',
    rows: 380,
    columns: 880,
    notes: 'Floor max height 100 cm'
  },
  rack: {
    title: 'Rack 600 x 450',
    rows: 450,
    columns: 600,
    notes: 'Rack levels max height 65 cm, small rack max height 16 cm'
  },
  'floor-long': {
    title: 'Floor area 2 - 380 x 740',
    rows: 740,
    columns: 380,
    notes: 'Floor max height 100 cm'
  }
};

function apiBase() {
  return (window.FREESPACE_API_BASE_URL || '').replace(/\/$/, '');
}

function showMessage(text, type = 'info') {
  const readable = {
    invalid_login: 'Username or password is incorrect.',
    auth_config: 'The login table is not reachable. Check SUPABASE_URL and make sure app_users exists.',
    login_version: 'An old login version is still deployed. Please redeploy on Vercel.'
  };
  els.message.textContent = readable[text] || text;
  els.message.className = `message ${type === 'error' ? 'error' : ''}`;
  window.setTimeout(() => els.message.classList.add('hidden'), 4200);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${appState.token}`,
    'Content-Type': 'application/json'
  };
}

async function apiFetch(path, options = {}) {
  const base = apiBase();
  if (!base) throw new Error('API URL is missing.');
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
  return data;
}

function setAuthUi() {
  const base = apiBase();
  els.setupPanel.classList.toggle('hidden', Boolean(base));
  els.logoutButton.classList.toggle('hidden', !appState.token);
  els.loginView.classList.toggle('hidden', Boolean(appState.token));
  els.appView.classList.toggle('hidden', !appState.token);
  els.userLabel.textContent = appState.user
    ? `Signed in: ${appState.user.login}`
    : appState.token
      ? 'Signed in'
      : 'Not signed in';
}

function placeKind(shelf) {
  if (shelf.location_type === 'floor') return 'floor';
  if (shelf.location_type === 'shelf') return 'shelf';
  const name = String(shelf.name || '').toLowerCase();
  return name.startsWith('boden') || name.includes('boden') || name.includes('floor') ? 'floor' : 'shelf';
}

function placeLabel(kind) {
  return kind === 'floor' ? 'Floor area' : 'Rack';
}

function packageTooltip(item) {
  const zone = zoneKind(item);
  const height = itemHeightCm(item);
  const count = stackCount(item);
  const parts = [
    item.package_name,
    formatSizeCm(item.width_units || 1, item.depth_units || 1),
    zone ? `${zone} zone` : `${count}x stacked, ${formatCm(height)} cm each, ${formatCm(count * height)} cm total`
  ];
  if (isStackedItem(item)) parts.push('stacked');
  const note = cleanHeightFromNote(item.note || '');
  if (note) parts.push(note);
  return parts.filter(Boolean).join(' | ');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberValue(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDecimal(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, '');
}

function formatCm(cm) {
  return formatDecimal(Math.max(1, Number(cm) || 1));
}

function formatSizeCm(width, depth) {
  return `${formatCm(width)} x ${formatCm(depth)} cm`;
}

function formatMeasureCm(cm) {
  return `${formatDecimal(cm)} cm`;
}

function formatAreaCm2(area) {
  return `${formatDecimal(Math.max(0, Number(area) || 0))} cm2`;
}

function rectArea(rect) {
  return Math.max(0, rect.width || 0) * Math.max(0, rect.depth || 0);
}

function rectIntersection(a, b) {
  const left = Math.max(a.column, b.column);
  const top = Math.max(a.row, b.row);
  const right = Math.min(a.column + a.width, b.column + b.width);
  const bottom = Math.min(a.row + a.depth, b.row + b.depth);
  if (right <= left || bottom <= top) return null;
  return { column: left, row: top, width: right - left, depth: bottom - top };
}

function inputCm(cm) {
  return formatCm(cm);
}

function cmInputToCm(value, fallbackCm = 100) {
  return Math.max(1, numberValue(value, fallbackCm));
}

function cmInputToMeters(value, fallbackCm = 100) {
  return formatDecimal(cmInputToCm(value, fallbackCm) / 100);
}

function itemHeightCm(item, fallback = 45) {
  const note = String(item?.note || '');
  const match = note.match(/height\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i) || note.match(/höhe\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  return cmInputToCm(match?.[1], fallback);
}

function cleanHeightFromNote(note) {
  return String(note || '')
    .replace(/(?:,\s*)?height\s*[0-9]+(?:[.,][0-9]+)?\s*cm/gi, '')
    .replace(/(?:,\s*)?höhe\s*[0-9]+(?:[.,][0-9]+)?\s*cm/gi, '')
    .replace(/\s*,\s*,\s*/g, ', ')
    .trim()
    .replace(/^,\s*/, '')
    .replace(/\s*,$/, '');
}

function noteWithHeight(note, height) {
  const clean = cleanHeightFromNote(note);
  const heightText = `height ${formatCm(height)} cm`;
  return clean ? `${clean}, ${heightText}` : heightText;
}

function stackCount(itemOrValue) {
  const value = typeof itemOrValue === 'object' ? itemOrValue.quantity : itemOrValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function stackTotalHeightCm(item) {
  return stackCount(item) * itemHeightCm(item);
}

function maxStackHeightForShelf(shelf, draft = null) {
  if (!shelf) return 100;
  if (placeKind(shelf) === 'floor') return 100;
  const row = draft?.row ?? Number.parseInt(els.rowIndex.value, 10) ?? 1;
  const column = draft?.column ?? Number.parseInt(els.columnIndex.value, 10) ?? 1;
  const smallRack = rackLevelSpecs(shelf).find(level => level.short);
  if (
    smallRack &&
    row >= smallRack.start &&
    row <= smallRack.end &&
    column >= smallRack.xStart &&
    column <= smallRack.xEnd
  ) {
    return 16;
  }
  return 65;
}

function maxFreeRunCm(shelf) {
  const rows = Math.max(1, Math.round(shelf.rows || 1));
  const columns = Math.max(1, Math.round(shelf.columns || 1));
  let best = 0;

  for (let row = 1; row <= rows; row += 1) {
    const blocked = shelf.packages
      .filter(item => row >= item.row_index && row < item.row_index + (item.depth_units || 1))
      .map(item => [
        clamp(item.column_index, 1, columns + 1),
        clamp(item.column_index + (item.width_units || 1), 1, columns + 1)
      ])
      .sort((a, b) => a[0] - b[0]);

    let cursor = 1;
    blocked.forEach(([start, end]) => {
      best = Math.max(best, start - cursor);
      cursor = Math.max(cursor, end);
    });
    best = Math.max(best, columns + 1 - cursor);
  }

  return best;
}

function lengthSummary(shelf) {
  return `${formatAreaCm2(freeAreaCm2(shelf))} free`;
}

function rackLevelSpecs(shelf) {
  const width = Math.max(1, shelf.columns || planPlaces.rack.columns);
  const height = Math.max(planPlaces.rack.rows, shelf.rows || planPlaces.rack.rows);
  const levelDepth = 90;
  const levelRange = index => {
    const start = ((index - 1) * levelDepth) + 1;
    const end = Math.min(index * levelDepth, height);
    return { start, end };
  };
  const small = levelRange(5);
  return [
    { level: 1, label: 'Rack level 1', ...levelRange(1), xStart: 1, xEnd: width, short: false, heightLabel: 'max height 65 cm' },
    { level: 2, label: 'Rack level 2', ...levelRange(2), xStart: 1, xEnd: width, short: false, heightLabel: 'max height 65 cm' },
    { level: 3, label: 'Rack level 3', ...levelRange(3), xStart: 1, xEnd: width, short: false, heightLabel: 'max height 65 cm' },
    { level: 4, label: 'Rack level 4', ...levelRange(4), xStart: 1, xEnd: width, short: false, heightLabel: 'max height 65 cm' },
    { level: 5, label: 'Small rack', ...small, xStart: Math.max(1, width - 149), xEnd: width, short: true, heightLabel: '150 x 90 cm, height 16 cm' }
  ];
}

function rackLevelRange(shelf, level) {
  const fallback = rackLevelSpecs(shelf)[0];
  const spec = rackLevelSpecs(shelf).find(item => item.level === level) || fallback;
  return {
    ...spec,
    height: Math.max(1, spec.end - spec.start + 1),
    width: Math.max(1, spec.xEnd - spec.xStart + 1)
  };
}

function effectiveRowsForShelf(shelf) {
  return planPlaceRole(shelf) === 'rack'
    ? Math.max(planPlaces.rack.rows, shelf.rows || planPlaces.rack.rows)
    : shelf.rows;
}

function shelfForSaving(shelf) {
  return {
    ...shelf,
    rows: effectiveRowsForShelf(shelf)
  };
}

function packageInRackLevel(item, range) {
  const top = item.row_index;
  const bottom = item.row_index + (item.depth_units || 1) - 1;
  const left = item.column_index;
  const right = item.column_index + (item.width_units || 1) - 1;
  return top <= range.end && bottom >= range.start && left <= range.xEnd && right >= range.xStart;
}

function packageRect(item) {
  return {
    column: item.column_index,
    row: item.row_index,
    width: item.width_units || 1,
    depth: item.depth_units || 1
  };
}

function rackLevelFreeRunCm(shelf, level) {
  const range = rackLevelRange(shelf, level);
  return maxFreeRunCm({
    ...shelf,
    rows: range.height,
    columns: range.width,
    packages: shelf.packages
      .filter(item => packageInRackLevel(item, range))
      .map(item => ({
        ...item,
        row_index: Math.max(1, item.row_index - range.start + 1),
        column_index: Math.max(1, item.column_index - range.xStart + 1)
      }))
  });
}

function rackLevelFreeAreaCm2(shelf, level) {
  const range = rackLevelRange(shelf, level);
  return freeAreaCm2({
    ...shelf,
    rows: range.height,
    columns: range.width,
    packages: shelf.packages
      .filter(item => packageInRackLevel(item, range))
      .map(item => {
        const clippedTop = Math.max(item.row_index, range.start);
        const clippedBottom = Math.min(item.row_index + (item.depth_units || 1) - 1, range.end);
        const clippedLeft = Math.max(item.column_index, range.xStart);
        const clippedRight = Math.min(item.column_index + (item.width_units || 1) - 1, range.xEnd);
        return {
          ...item,
          row_index: clippedTop - range.start + 1,
          column_index: clippedLeft - range.xStart + 1,
          width_units: Math.max(1, clippedRight - clippedLeft + 1),
          depth_units: Math.max(1, clippedBottom - clippedTop + 1)
        };
      })
  });
}

function draftInRackRange(shelf, range, cell, size) {
  const savingShelf = shelfForSaving(shelf);
  const width = Math.min(size.width, range.width);
  const depth = Math.min(size.depth, range.height);
  const column = clamp(range.xStart + cell.column - 1, range.xStart, Math.max(range.xStart, range.xEnd - width + 1));
  const row = clamp(range.start + cell.row - 1, range.start, Math.max(range.start, range.end - depth + 1));
  return draftAtCell({ column, row }, savingShelf, { width, depth });
}

function rackLocalDraft(draft, range) {
  const clippedTop = Math.max(draft.row, range.start);
  const clippedBottom = Math.min(draft.row + draft.depth - 1, range.end);
  const clippedLeft = Math.max(draft.column, range.xStart);
  const clippedRight = Math.min(draft.column + draft.width - 1, range.xEnd);
  return {
    row: clippedTop - range.start + 1,
    column: clippedLeft - range.xStart + 1,
    width: Math.max(1, clippedRight - clippedLeft + 1),
    depth: Math.max(1, clippedBottom - clippedTop + 1)
  };
}

function rackGlobalDraft(shelf, range, localDraft) {
  return draftInRackRange(
    shelf,
    range,
    { column: localDraft.column, row: localDraft.row },
    { width: localDraft.width, depth: localDraft.depth }
  );
}

function activeMeasurement(shelf, level = null) {
  const measurement = appState.measurement;
  if (!measurement || measurement.shelfId !== shelf.id || measurement.level !== level) return null;
  return measurement;
}

function isMeasuring(shelf, level = null) {
  const measurement = activeMeasurement(shelf, level);
  return Boolean(measurement && measurement.active);
}

function clearMeasurement() {
  appState.measurement = null;
}

function toggleMeasurement(shelf, level = null, mode = 'line') {
  const measurement = activeMeasurement(shelf, level);
  if (measurement?.active && measurement.mode === mode) {
    clearMeasurement();
    return;
  }
  appState.measurement = {
    active: true,
    shelfId: shelf.id,
    level,
    mode,
    start: null,
    current: null,
    end: null
  };
}

function startMeasurement(shelf, level, point) {
  const measurement = activeMeasurement(shelf, level) || {
    active: true,
    shelfId: shelf.id,
    level,
    start: null,
    current: null,
    end: null
  };
  measurement.start = point;
  measurement.current = point;
  measurement.end = null;
  appState.measurement = measurement;
  return measurement;
}

function canvasMeasureSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  };
}

function updateMeasurement(shelf, level, point, done = false, pixelSize = null) {
  const measurement = activeMeasurement(shelf, level);
  if (!measurement?.start) return null;
  measurement.current = point;
  measurement.end = done ? point : null;
  if (pixelSize) measurement.pixelSize = pixelSize;
  appState.measurement = measurement;
  return measurement;
}

function measureSummary(measurement) {
  if (!measurement?.start) return '';
  const end = measurement.end || measurement.current || measurement.start;
  const width = end.column - measurement.start.column;
  const depth = end.row - measurement.start.row;
  if (measurement.mode === 'area') {
    return `${formatCm(Math.abs(width))} x ${formatCm(Math.abs(depth))} cm = ${formatAreaCm2(Math.abs(width * depth))}`;
  }
  return formatMeasureCm(Math.hypot(width, depth));
}

function findFreeRackDraft(shelf, range, size) {
  const width = Math.min(size.width, range.width);
  const depth = Math.min(size.depth, range.height);
  const step = Math.max(1, Math.min(10, Math.round(Math.min(width, depth) / 4)));

  for (let row = range.start; row <= range.end - depth + 1; row += step) {
    for (let column = range.xStart; column <= range.xEnd - width + 1; column += step) {
      const draft = { row, column, width, depth };
      const collision = shelf.packages.some(item => !isYellowZone(item) && rectsOverlap(draftRect(draft), packageRect(item)));
      if (!collision) return draft;
    }
  }

  const fallback = { row: range.start, column: range.xStart, width, depth };
  return shelf.packages.some(item => !isYellowZone(item) && rectsOverlap(draftRect(fallback), packageRect(item))) ? null : fallback;
}

function findFreeDraft(shelf, size) {
  const width = Math.min(size.width, shelf.columns);
  const depth = Math.min(size.depth, shelf.rows);
  const step = Math.max(1, Math.min(10, Math.round(Math.min(width, depth) / 4)));

  for (let row = 1; row <= shelf.rows - depth + 1; row += step) {
    for (let column = 1; column <= shelf.columns - width + 1; column += step) {
      const draft = { row, column, width, depth };
      const collision = shelf.packages.some(item => !isYellowZone(item) && rectsOverlap(draftRect(draft), packageRect(item)));
      if (!collision) return draft;
    }
  }

  const fallback = { row: 1, column: 1, width, depth };
  return shelf.packages.some(item => !isYellowZone(item) && rectsOverlap(draftRect(fallback), packageRect(item))) ? null : fallback;
}

function totalFreeRun(shelves) {
  return shelves.reduce((sum, shelf) => sum + maxFreeRunCm(shelf), 0);
}

function totalFreeArea(shelves) {
  return shelves.reduce((sum, shelf) => sum + freeAreaCm2(shelf), 0);
}

function isBlockedItem(item) {
  return zoneKind(item) === 'red';
}

function zoneKind(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  if (text.includes('zone:red') || text.includes('red no-place') || text.includes('blocked') || text.includes('rot') || text.includes('verbot') || text.includes('nicht abstellen')) return 'red';
  if (text.includes('zone:yellow') || text.includes('yellow reserve') || text.includes('gelb') || text.includes('reserve')) return 'yellow';
  return '';
}

function isZoneItem(item) {
  return Boolean(zoneKind(item));
}

function isYellowZone(item) {
  return zoneKind(item) === 'yellow';
}

function occupiedAreaCm2(shelf, predicate = () => true) {
  const bounds = { column: 1, row: 1, width: shelf.columns || 1, depth: effectiveRowsForShelf(shelf) || shelf.rows || 1 };
  const rects = shelf.packages
    .filter(predicate)
    .map(item => rectIntersection(bounds, packageRect(item)))
    .filter(Boolean);

  return rects.reduce((sum, rect, index) => {
    let visible = rectArea(rect);
    for (let previous = 0; previous < index; previous += 1) {
      const overlap = rectIntersection(rect, rects[previous]);
      if (overlap) visible -= rectArea(overlap);
    }
    return sum + Math.max(0, visible);
  }, 0);
}

function freeAreaCm2(shelf) {
  const total = (shelf.columns || 0) * (effectiveRowsForShelf(shelf) || shelf.rows || 0);
  return Math.max(0, total - occupiedAreaCm2(shelf));
}

function itemAreaCm2(shelf) {
  return occupiedAreaCm2(shelf, item => !isZoneItem(item));
}

function zoneAreaCm2(shelf) {
  return occupiedAreaCm2(shelf, isZoneItem);
}

function isStackedItem(item) {
  return stackCount(item) > 1 || String(item.note || '').toLowerCase().includes('gestap');
}

function normalizeDecimalInput(input) {
  input.value = input.value.replace(',', '.');
}

function hasCompleteDecimalValue(input) {
  const value = input.value.trim();
  return value !== '' && value !== '0' && value !== '.' && !value.endsWith('.');
}

function normalizeDecimalFields(...fields) {
  fields.forEach(normalizeDecimalInput);
}

function canvasCellFromEvent(event, canvas, shelf) {
  const rect = canvas.getBoundingClientRect();
  return {
    column: clamp(Math.floor(((event.clientX - rect.left) / rect.width) * shelf.columns) + 1, 1, shelf.columns),
    row: clamp(Math.floor(((event.clientY - rect.top) / rect.height) * shelf.rows) + 1, 1, shelf.rows)
  };
}

function canvasMeasurePointFromEvent(event, canvas, shelf) {
  const rect = canvas.getBoundingClientRect();
  return {
    column: clamp(((event.clientX - rect.left) / rect.width) * shelf.columns, 0, shelf.columns),
    row: clamp(((event.clientY - rect.top) / rect.height) * shelf.rows, 0, shelf.rows)
  };
}

function currentPackageSize() {
  return {
    width: cmInputToCm(els.widthUnits.value, 100),
    depth: cmInputToCm(els.depthUnits.value, 100)
  };
}

function draftAtCell(cell, shelf, size) {
  return {
    column: clamp(cell.column, 1, Math.max(1, shelf.columns - size.width + 1)),
    row: clamp(cell.row, 1, Math.max(1, shelf.rows - size.depth + 1)),
    width: clamp(size.width, 1, shelf.columns),
    depth: clamp(size.depth, 1, shelf.rows)
  };
}

function draftFromCorners(start, end, shelf) {
  const column = Math.min(start.column, end.column);
  const row = Math.min(start.row, end.row);
  const width = Math.abs(end.column - start.column) + 1;
  const depth = Math.abs(end.row - start.row) + 1;
  return draftAtCell({ column, row }, shelf, { width, depth });
}

function draftRect(draft) {
  return {
    column: draft.column ?? draft.columnIndex ?? 1,
    row: draft.row ?? draft.rowIndex ?? 1,
    width: draft.width ?? draft.widthUnits ?? 1,
    depth: draft.depth ?? draft.depthUnits ?? 1
  };
}

function rectsOverlap(a, b) {
  return (
    a.column < b.column + b.width &&
    a.column + a.width > b.column &&
    a.row < b.row + b.depth &&
    a.row + a.depth > b.row
  );
}

function touchesForbiddenArea(shelf, draft) {
  const rect = draftRect(draft);
  return shelf.packages.some(item => isBlockedItem(item) && rectsOverlap(rect, packageRect(item)));
}

function floorStackOverlapHeight(shelf, candidate, excludeId = '') {
  if (!shelf || placeKind(shelf) !== 'floor') return 0;
  const rect = draftRect(candidate);
  return shelf.packages
    .filter(item => item.id !== excludeId && !isZoneItem(item) && rectsOverlap(rect, packageRect(item)))
    .reduce((sum, item) => sum + stackTotalHeightCm(item), 0);
}

function selectedDraft() {
  if (!appState.selected || els.packageId.value) return null;
  return {
    shelf: appState.selected.shelf,
    row: Number.parseInt(els.rowIndex.value, 10) || appState.selected.row,
    column: Number.parseInt(els.columnIndex.value, 10) || appState.selected.column,
    width: cmInputToCm(els.widthUnits.value, 100),
    depth: cmInputToCm(els.depthUnits.value, 100)
  };
}

function selectedPackageDraft(item) {
  if (!els.packageId.value || els.packageId.value !== item.id) return null;
  return {
    row: Number.parseInt(els.rowIndex.value, 10) || item.row_index,
    column: Number.parseInt(els.columnIndex.value, 10) || item.column_index,
    width: cmInputToCm(els.widthUnits.value, item.width_units || 100),
    depth: cmInputToCm(els.depthUnits.value, item.depth_units || 100)
  };
}

function setDraftFormValues(shelf, draft) {
  const savingShelf = shelfForSaving(shelf);
  const adjusted = draftAtCell(
    { row: draft.row, column: draft.column },
    savingShelf,
    { width: draft.width, depth: draft.depth }
  );
  els.rowIndex.value = adjusted.row;
  els.columnIndex.value = adjusted.column;
  els.widthUnits.value = inputCm(adjusted.width);
  els.depthUnits.value = inputCm(adjusted.depth);
  appState.selected = { shelf, row: adjusted.row, column: adjusted.column };
  els.selectedCell.textContent = `${shelf.name}: ${formatSizeCm(adjusted.width, adjusted.depth)} selected`;
  return adjusted;
}

function setPackageEditFormValues(shelf, draft) {
  const savingShelf = shelfForSaving(shelf);
  const adjusted = draftAtCell(
    { row: draft.row, column: draft.column },
    savingShelf,
    { width: draft.width, depth: draft.depth }
  );
  els.rowIndex.value = adjusted.row;
  els.columnIndex.value = adjusted.column;
  els.widthUnits.value = inputCm(adjusted.width);
  els.depthUnits.value = inputCm(adjusted.depth);
  appState.selected = { shelf, row: adjusted.row, column: adjusted.column };
  els.selectedCell.textContent = `${shelf.name}: change ready`;
  return adjusted;
}

function applyDraftSelection(shelf, draft) {
  if (!draft) {
    showMessage('There is no available space for this size in this rack area.', 'error');
    return false;
  }
  if (touchesForbiddenArea(shelf, draft)) {
    showMessage('This red zone is blocked. Do not place items there.', 'error');
    return false;
  }
  appState.selected = { shelf, row: draft.row, column: draft.column };
  els.packageId.value = '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputCm(effectiveRowsForShelf(shelf));
  els.shelfColumns.value = inputCm(shelf.columns);
  setDraftFormValues(shelf, draft);
  if (!els.packageName.value.trim()) {
    els.packageName.value = 'Item';
  }
  els.formTitle.textContent = 'Add item';
  els.saveButton.textContent = 'Save item';
  els.deletePackageButton.classList.add('hidden');
  els.cancelEditButton.classList.add('hidden');
  showMessage(`${shelf.name}: space selected. Save when ready.`);
  return true;
}

function selectCell(shelf, row, column, item) {
  appState.selected = { shelf, row, column };
  els.packageId.value = item ? item.id : '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputCm(effectiveRowsForShelf(shelf));
  els.shelfColumns.value = inputCm(shelf.columns);
  els.rowIndex.value = row;
  els.columnIndex.value = column;
  els.widthUnits.value = item ? inputCm(item.width_units || 120) : 120;
  els.depthUnits.value = item ? inputCm(item.depth_units || 80) : 80;
  els.heightUnits.value = item ? inputCm(itemHeightCm(item)) : 45;
  els.packageName.value = item ? item.package_name : '';
  els.quantity.value = item ? item.quantity : 1;
  els.note.value = item ? cleanHeightFromNote(item.note || '') : '';
  els.formTitle.textContent = item ? 'Edit item' : 'Add item';
  els.saveButton.textContent = item ? 'Save changes' : 'Save item';
  els.deletePackageButton.classList.toggle('hidden', !item);
  els.cancelEditButton.classList.toggle('hidden', !item);
  els.selectedCell.textContent = item
    ? `${shelf.name}: editing active`
    : `${shelf.name}: space selected`;
  if (!item) els.packageName.focus();
  render();
}

function clearPackageForm() {
  appState.selected = null;
  els.packageId.value = '';
  els.packageName.value = '';
  els.quantity.value = 1;
  els.note.value = '';
  els.widthUnits.value = 120;
  els.depthUnits.value = 80;
  els.heightUnits.value = 45;
  els.formTitle.textContent = 'Add item';
  els.saveButton.textContent = 'Save item';
  els.deletePackageButton.classList.add('hidden');
  els.cancelEditButton.classList.add('hidden');
}

function updateDraftFromSizeInputs(event) {
  if (event?.target) normalizeDecimalInput(event.target);
  if (!hasCompleteDecimalValue(els.widthUnits) || !hasCompleteDecimalValue(els.depthUnits)) return;
  const draft = selectedDraft();
  if (draft) {
    if (placeKind(draft.shelf) === 'shelf') {
      const range = rackLevelRange(draft.shelf, appState.activeRackLevel);
      setDraftFormValues(draft.shelf, rackGlobalDraft(
        draft.shelf,
        range,
        rackLocalDraft(draft, range)
      ));
      render();
      return;
    }
    setDraftFormValues(draft.shelf, draft);
    render();
    return;
  }
  if (els.packageId.value && appState.selected?.shelf) {
    setPackageEditFormValues(appState.selected.shelf, {
      row: Number.parseInt(els.rowIndex.value, 10) || appState.selected.row,
      column: Number.parseInt(els.columnIndex.value, 10) || appState.selected.column,
      width: cmInputToCm(els.widthUnits.value, 100),
      depth: cmInputToCm(els.depthUnits.value, 100)
    });
  }
  render();
}

function setActiveView(view) {
  appState.activeView = view;
  els.packageView.classList.toggle('hidden', view !== 'packages');
  els.placeView.classList.toggle('hidden', view !== 'places');
  els.packagesTab?.classList.toggle('active', view === 'packages');
  els.placesTab?.classList.toggle('active', view === 'places');
  render();
}

function setActivePlanRole(role) {
  appState.activePlanRole = role;
  clearPackageForm();
  els.selectedCell.textContent = 'No area selected';
  render();
}

function clearPlaceForm() {
  els.placeId.value = '';
  els.placeLocationType.value = 'shelf';
  els.placeName.value = '';
  els.placeRows.value = planPlaces.rack.rows;
  els.placeColumns.value = 600;
  els.placeNotes.value = '';
  els.savePlaceButton.textContent = 'Save area';
  els.cancelPlaceButton.classList.add('hidden');
}

async function deletePackage(id) {
  await apiFetch(`/api/regale?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('Item deleted.');
  await loadShelves();
}

function render() {
  setAuthUi();
  els.shelves.innerHTML = '';
  els.overviewCards.innerHTML = '';
  els.warehouseMap.innerHTML = '';
  els.placeList.innerHTML = '';

  if (!appState.token) {
    els.summaryText.textContent = 'Please sign in.';
    return;
  }

  const floorPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'floor');
  const shelfPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'shelf');
  const planShelves = selectedPlanShelves(shelfPlaces, floorPlaces);
  const oldPlaces = appState.shelves.filter(shelf => !planPlaceRole(shelf));
  const freeArea = totalFreeArea(planShelves);
  els.summaryText.textContent = planShelves.length
    ? `${formatAreaCm2(freeArea)} free area across the 3 layout areas.${oldPlaces.length ? ` ${oldPlaces.length} old area hidden.` : ''}`
    : `The 3 layout areas have not been created yet.${oldPlaces.length ? ` ${oldPlaces.length} old area is listed under Manage areas.` : ''}`;

  renderOverview(
    planShelves,
    shelfPlaces.filter(shelf => planPlaceRole(shelf) === 'rack'),
    floorPlaces.filter(shelf => planPlaceRole(shelf))
  );
  renderModel3d(planShelves);
  renderPlanDrawing(shelfPlaces, floorPlaces);
  renderPlaces();
}

function selectedPlanShelves(shelfPlaces, floorPlaces) {
  const all = [...shelfPlaces, ...floorPlaces];
  return ['floor-main', 'rack', 'floor-long']
    .map(role => findPlanShelf(role, all))
    .filter(Boolean);
}

function isNearSize(shelf, role) {
  const expected = expectedPlanSize(role);
  return Math.abs((shelf.columns || 0) - expected.columns) <= 2 && Math.abs((shelf.rows || 0) - expected.rows) <= 2;
}

function planPlaceRole(shelf) {
  const text = `${shelf.name || ''} ${shelf.label || ''} ${shelf.notes || ''}`.toLowerCase();
  if (placeKind(shelf) === 'shelf') {
    return isNearSize(shelf, 'rack') || text.includes('4 rack') || text.includes('4 regale') || text.includes('4 plätze') || text.includes('600 x 450') || text.includes('600 x 360') || text.includes('600 x 90') || text.includes('600 x 106')
      ? 'rack'
      : null;
  }
  if (text.includes('floor area 2') || text.includes('bodenplatz 2') || text.includes('380 x 740') || text.includes('390 x 740') || text.includes('70 x 380') || text.includes('380 x 70') || isNearSize(shelf, 'floor-long')) {
    return 'floor-long';
  }
  if (text.includes('floor area 1') || text.includes('bodenplatz 1') || text.includes('880 x 380') || text.includes('100 x 80') || text.includes('80 x 100') || isNearSize(shelf, 'floor-main')) {
    return 'floor-main';
  }
  return null;
}

function planRole(shelf) {
  return planPlaceRole(shelf) || 'other';
}

function planTitle(role) {
  return planPlaces[role]?.title || 'Storage area';
}

function expectedPlanSize(role) {
  const place = planPlaces[role] || planPlaces['floor-main'];
  return { columns: place.columns, rows: place.rows };
}

function defaultPlacePayload(role) {
  const place = planPlaces[role];
  return {
    locationType: role === 'rack' ? 'shelf' : 'floor',
    name: place.title,
    rows: cmInputToMeters(place.rows, place.rows),
    columns: cmInputToMeters(place.columns, place.columns),
    notes: place.notes
  };
}

function placeNeedsPlanUpdate(place, role) {
  const expected = expectedPlanSize(role);
  return (
    Math.round(place.rows || 0) !== expected.rows ||
    Math.round(place.columns || 0) !== expected.columns ||
    place.name !== planTitle(role)
  );
}

async function saveDefaultPlanPlace(role, existing = null) {
  const payload = defaultPlacePayload(role);
  if (existing) {
    await apiFetch('/api/places', {
      method: 'PATCH',
      body: JSON.stringify({ ...payload, id: existing.id })
    });
    return 'updated';
  }
  await apiFetch('/api/places', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return 'created';
}

function findPlanShelf(role, shelves) {
  return shelves.find(shelf => planPlaceRole(shelf) === role) || null;
}

function renderPlanDrawing(shelfPlaces, floorPlaces) {
  const all = [...shelfPlaces, ...floorPlaces];
  const plan = document.createElement('section');
  plan.className = 'plan-drawing';
  plan.append(renderPlanSwitcher());
  plan.append(renderPlanSlot(appState.activePlanRole, findPlanShelf(appState.activePlanRole, all)));
  els.shelves.append(plan);
}

function renderPlanSwitcher() {
  const nav = document.createElement('div');
  nav.className = 'plan-switcher';
  [
    ['floor-main', 'Floor area 1'],
    ['rack', 'Rack'],
    ['floor-long', 'Floor area 2']
  ].forEach(([role, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `plan-switch ${appState.activePlanRole === role ? 'active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => setActivePlanRole(role));
    nav.append(button);
  });
  return nav;
}

function renderPlanSlot(role, shelf) {
  const slot = document.createElement('section');
  slot.className = `plan-slot ${role}`;

  const expected = expectedPlanSize(role);
  const displayShelf = shelf || {
    id: `placeholder-${role}`,
    name: planTitle(role),
    label: planTitle(role),
    rows: expected.rows,
    columns: expected.columns,
    packages: [],
    freePlaces: expected.rows * expected.columns,
    usedPlaces: 0,
    totalPlaces: expected.rows * expected.columns,
    location_type: role === 'rack' ? 'shelf' : 'floor'
  };
  const kind = placeKind(displayShelf);

  const meta = document.createElement('div');
  meta.className = 'shelf-meta plan-meta';
  meta.innerHTML = `
    <div>
      <span class="place-type">${placeLabel(kind)}</span>
      <h2>${escapeHtml(displayShelf.label || displayShelf.name)}</h2>
    </div>
    <div class="stats">
      <span class="stat">${formatSizeCm(displayShelf.columns, displayShelf.rows)}</span>
      <span class="stat">${shelf ? lengthSummary(displayShelf) : 'not created yet'}</span>
      ${role === 'rack' ? '<span class="stat">rack height 65 cm / small 16 cm</span>' : '<span class="stat">max height 100 cm</span>'}
    </div>
  `;
  slot.append(meta);

  if (shelf) {
    if (role === 'rack') {
      slot.append(renderRackDisplay(displayShelf));
    } else {
      slot.append(renderPlaceTools(displayShelf));
      slot.append(renderPlaceCanvas(displayShelf, kind, role));
    }
  } else {
    slot.append(renderPlanPlaceholder(role, displayShelf));
  }

  return slot;
}

function renderPlanPlaceholder(role, shelf) {
  const placeholder = document.createElement('button');
  placeholder.type = 'button';
  placeholder.className = `place-canvas plan-placeholder ${role === 'rack' ? '' : 'floor-canvas'}`;
  placeholder.style.setProperty('--cols', Math.max(1, Math.round(shelf.columns / (role === 'rack' ? 150 : 100))));
  placeholder.style.setProperty('--rows', Math.max(1, Math.ceil(shelf.rows / 100)));
  placeholder.style.aspectRatio = `${shelf.columns} / ${Math.max(1, shelf.rows)}`;
  placeholder.append(renderDimensionLabels(shelf, placeKind(shelf), role));
  const mark = document.createElement('span');
  mark.className = 'placeholder-action';
  mark.textContent = 'Create area';
  placeholder.append(mark);
  placeholder.addEventListener('click', () => {
    createPlanPlace(role).catch(error => showMessage(error.message, 'error'));
  });
  return placeholder;
}

function renderRackDisplay(shelf) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rack-display';

  const levels = document.createElement('div');
  levels.className = 'rack-levels';

  rackLevelSpecs(shelf).forEach(spec => {
    const level = spec.level;
    const button = document.createElement('button');
    const range = rackLevelRange(shelf, level);
    const packages = shelf.packages.filter(item => packageInRackLevel(item, range));
    button.type = 'button';
    button.className = `rack-level ${range.short ? 'short-level' : ''} ${appState.activeRackLevel === level ? 'active' : ''}`;
    button.innerHTML = `
      <span>${escapeHtml(range.label)}</span>
      <strong>${formatAreaCm2(rackLevelFreeAreaCm2(shelf, level))} free</strong>
      <small>${range.heightLabel || `${packages.length} positions`}</small>
      ${range.short ? '<i class="short-shelf-mark" aria-hidden="true"></i>' : ''}
    `;
    button.addEventListener('click', () => {
      appState.activeRackLevel = level;
      applyDraftSelection(shelf, findFreeRackDraft(shelf, range, currentPackageSize()));
      render();
    });
    levels.append(button);
  });

  wrapper.append(levels);
  wrapper.append(renderRackTools(shelf, appState.activeRackLevel));
  wrapper.append(renderRackLevelDetail(shelf, appState.activeRackLevel));
  return wrapper;
}

function renderRackTools(shelf, level) {
  const tools = document.createElement('div');
  tools.className = 'rack-tools';
  const measurement = activeMeasurement(shelf, level);
  tools.append(renderMeasureButton(shelf, level, 'line', 'Measure', measurement));
  tools.append(renderMeasureButton(shelf, level, 'area', 'cm2', measurement));

  const label = document.createElement('span');
  label.className = 'measure-status';
  if (!measurement?.active) {
    label.textContent = 'Drag to measure';
  } else if (!measurement.start) {
    label.textContent = 'Click and drag on the drawing';
  } else {
    label.textContent = `Measured: ${measureSummary(measurement)}`;
  }
  tools.append(label);
  return tools;
}

function renderPlaceTools(shelf) {
  const tools = document.createElement('div');
  tools.className = 'rack-tools';
  const measurement = activeMeasurement(shelf);
  tools.append(renderMeasureButton(shelf, null, 'line', 'Measure', measurement));
  tools.append(renderMeasureButton(shelf, null, 'area', 'cm2', measurement));

  const label = document.createElement('span');
  label.className = 'measure-status';
  label.textContent = !measurement?.active
    ? 'Drag to measure'
    : measurement.start
      ? `Measured: ${measureSummary(measurement)}`
      : 'Click and drag on the drawing';
  tools.append(label);
  return tools;
}

function renderMeasureButton(shelf, level, mode, label, measurement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `measure-toggle ${measurement?.active && measurement.mode === mode ? 'active' : ''}`;
  button.innerHTML = `<span class="measure-icon" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  button.addEventListener('click', () => {
    toggleMeasurement(shelf, level, mode);
    render();
  });
  return button;
}

function renderRackLevelDetail(shelf, level) {
  const range = rackLevelRange(shelf, level);
  const canvas = document.createElement('div');
  const measurement = activeMeasurement(shelf, level);
  let measuringPointer = null;
  canvas.className = `rack-level-detail place-canvas ${range.short ? 'short-rack-detail' : ''}`;
  canvas.style.setProperty('--cols', 1);
  canvas.style.setProperty('--rows', 1);
  canvas.style.aspectRatio = `${range.width} / ${Math.max(1, range.height)}`;
  canvas.append(renderDimensionLabels({ ...shelf, columns: range.width, rows: range.height }, 'shelf', range.short ? 'rack-short-detail' : 'rack-detail'));
  canvas.append(renderMeasureOverlay(measurement, range));

  const visiblePackages = shelf.packages.filter(item => packageInRackLevel(item, range));
  visiblePackages.forEach(item => {
    const rectangle = document.createElement('button');
    const selectedPackage = els.packageId.value === item.id;
    const editDraft = selectedPackage ? selectedPackageDraft(item) : null;
    const displayItem = editDraft
      ? {
        ...item,
        row_index: editDraft.row,
        column_index: editDraft.column,
        width_units: editDraft.width,
        depth_units: editDraft.depth
      }
      : item;
    const clippedTop = Math.max(displayItem.row_index, range.start);
    const clippedBottom = Math.min(displayItem.row_index + (displayItem.depth_units || 1) - 1, range.end);
    const clippedLeft = Math.max(displayItem.column_index, range.xStart);
    const clippedRight = Math.min(displayItem.column_index + (displayItem.width_units || 1) - 1, range.xEnd);
    const visibleDepth = Math.max(1, clippedBottom - clippedTop + 1);
    const visibleWidth = Math.max(1, clippedRight - clippedLeft + 1);
    rectangle.className = `package-rect rack-package ${selectedPackage ? 'selected' : ''}`;
    rectangle.classList.toggle('blocked-zone', isBlockedItem(displayItem));
    rectangle.classList.toggle('reserve-zone', isYellowZone(displayItem));
    rectangle.classList.toggle('stacked-zone', isStackedItem(displayItem));
    rectangle.type = 'button';
    rectangle.style.left = `${((clippedLeft - range.xStart) / range.width) * 100}%`;
    rectangle.style.top = `${((clippedTop - range.start) / range.height) * 100}%`;
    rectangle.style.width = `${(visibleWidth / range.width) * 100}%`;
    rectangle.style.height = `${(visibleDepth / range.height) * 100}%`;
    rectangle.dataset.tooltip = packageTooltip(displayItem);
    rectangle.setAttribute('aria-label', item.package_name);
    rectangle.innerHTML = packageHtml(displayItem, selectedPackage);
    rectangle.addEventListener('pointerdown', event => {
      if (!selectedPackage) return;
      startRackPackageEdit(event, canvas, shelf, range, item, rectangle, displayItem);
    });
    rectangle.addEventListener('click', () => {
      if (rectangle.dataset.dragged === 'true') {
        rectangle.dataset.dragged = 'false';
        return;
      }
      selectCell(shelf, item.row_index, item.column_index, item);
    });
    canvas.append(rectangle);
  });

  const draft = selectedDraft();
  const draftVisibleInRange = draft && draft.shelf.id === shelf.id && packageInRackLevel({
    row_index: draft.row,
    column_index: draft.column,
    width_units: draft.width,
    depth_units: draft.depth
  }, range);
  if (draftVisibleInRange) {
    const marker = document.createElement('div');
    const localDraft = rackLocalDraft(draft, range);
    marker.className = 'draft-marker rack-draft-marker';
    marker.innerHTML = draftMarkerHtml(draft);
    updateDragMarker({ columns: range.width, rows: range.height }, marker, localDraft);
    marker.addEventListener('pointerdown', event => startRackDraftEdit(event, canvas, shelf, range, marker, localDraft));
    canvas.append(marker);
  }

  if (!visiblePackages.length && !draftVisibleInRange) {
    const empty = document.createElement('div');
    empty.className = 'canvas-empty';
    empty.textContent = `${range.label} is free`;
    canvas.append(empty);
  }

  canvas.addEventListener('pointerdown', event => {
    if (isMeasuring(shelf, level)) {
      event.preventDefault();
      event.stopPropagation();
      const point = canvasMeasurePointFromEvent(event, canvas, { ...shelf, columns: range.width, rows: range.height });
      measuringPointer = event.pointerId;
      startMeasurement(shelf, level, point);
      updateMeasurement(shelf, level, point, false, canvasMeasureSize(canvas));
      canvas.setPointerCapture(event.pointerId);
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(activeMeasurement(shelf, level), range));
      return;
    }
    if (event.target.closest('.package-rect, .draft-marker')) return;
    event.preventDefault();
    const cell = canvasCellFromEvent(event, canvas, { ...shelf, columns: range.width, rows: range.height });
    applyDraftSelection(shelf, draftInRackRange(shelf, range, cell, currentPackageSize()));
    render();
    els.packageName.focus();
  }, true);

  canvas.addEventListener('pointermove', event => {
    if (measuringPointer !== event.pointerId || !isMeasuring(shelf, level)) return;
    event.preventDefault();
    updateMeasurement(
      shelf,
      level,
      canvasMeasurePointFromEvent(event, canvas, { ...shelf, columns: range.width, rows: range.height }),
      false,
      canvasMeasureSize(canvas)
    );
    canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(activeMeasurement(shelf, level), range));
  });

  canvas.addEventListener('pointerup', event => {
    if (measuringPointer !== event.pointerId || !isMeasuring(shelf, level)) return;
    event.preventDefault();
    updateMeasurement(
      shelf,
      level,
      canvasMeasurePointFromEvent(event, canvas, { ...shelf, columns: range.width, rows: range.height }),
      true,
      canvasMeasureSize(canvas)
    );
    measuringPointer = null;
    render();
  });

  return canvas;
}

function renderMeasureOverlay(measurement, range) {
  const overlay = document.createElement('div');
  overlay.className = 'measure-overlay';
  if (!measurement?.active || !measurement.start) return overlay;

  const start = measurement.start;
  const end = measurement.end || measurement.current || measurement.start;
  const x1 = (start.column / range.width) * 100;
  const y1 = (start.row / range.height) * 100;
  const x2 = (end.column / range.width) * 100;
  const y2 = (end.row / range.height) * 100;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const pixelWidth = measurement.pixelSize?.width || 100;
  const pixelHeight = measurement.pixelSize?.height || 100;
  const pixelDx = (dx / 100) * pixelWidth;
  const pixelDy = (dy / 100) * pixelHeight;
  const length = Math.hypot(pixelDx, pixelDy);
  const angle = Math.atan2(pixelDy, pixelDx) * (180 / Math.PI);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const boxWidth = Math.abs(dx);
  const boxHeight = Math.abs(dy);

  const firstPoint = document.createElement('span');
  firstPoint.className = 'measure-point';
  firstPoint.style.left = `${x1}%`;
  firstPoint.style.top = `${y1}%`;
  overlay.append(firstPoint);

  if (measurement.current || measurement.end) {
    const secondPoint = document.createElement('span');
    secondPoint.className = 'measure-point end';
    secondPoint.style.left = `${x2}%`;
    secondPoint.style.top = `${y2}%`;
    overlay.append(secondPoint);

    if (measurement.mode === 'area') {
      const box = document.createElement('span');
      box.className = 'measure-box';
      box.style.left = `${left}%`;
      box.style.top = `${top}%`;
      box.style.width = `${boxWidth}%`;
      box.style.height = `${boxHeight}%`;
      overlay.append(box);
    } else {
      const line = document.createElement('span');
      line.className = 'measure-line';
      line.style.left = `${x1}%`;
      line.style.top = `${y1}%`;
      line.style.width = `${length}px`;
      line.style.transform = `rotate(${angle}deg)`;
      overlay.append(line);
    }

    const label = document.createElement('span');
    const labelX = (x1 + x2) / 2;
    const labelY = (y1 + y2) / 2;
    label.className = `measure-label ${measureLabelPositionClass(labelX, labelY)}`;
    label.style.left = `${labelX}%`;
    label.style.top = `${labelY}%`;
    label.textContent = measureSummary(measurement);
    overlay.append(label);
  }

  return overlay;
}

function measureLabelPositionClass(x, y) {
  return [
    x < 18 ? 'near-left' : '',
    x > 82 ? 'near-right' : '',
    y < 14 ? 'near-top' : ''
  ].filter(Boolean).join(' ');
}

function renderPlaceCanvas(shelf, kind, role = planRole(shelf)) {
  const canvas = document.createElement('div');
  let dragStart = null;
  let dragDraft = null;
  let dragMarker = null;
  let measuringPointer = null;
  const measurement = activeMeasurement(shelf);
  canvas.className = `place-canvas ${kind === 'floor' ? 'floor-canvas' : ''}`;
  canvas.style.setProperty('--cols', Math.max(1, Math.round(shelf.columns / (kind === 'shelf' ? 150 : 100))));
  canvas.style.setProperty('--rows', Math.max(1, Math.ceil(shelf.rows / 100)));
  canvas.style.aspectRatio = `${shelf.columns} / ${Math.max(1, shelf.rows)}`;
  canvas.append(renderDimensionLabels(shelf, kind, role));
  canvas.append(renderMeasureOverlay(measurement, { width: shelf.columns, height: shelf.rows }));
  canvas.addEventListener('pointerdown', event => {
    if (isMeasuring(shelf)) {
      event.preventDefault();
      event.stopPropagation();
      measuringPointer = event.pointerId;
      const point = canvasMeasurePointFromEvent(event, canvas, shelf);
      startMeasurement(shelf, null, point);
      updateMeasurement(shelf, null, point, false, canvasMeasureSize(canvas));
      canvas.setPointerCapture(event.pointerId);
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(activeMeasurement(shelf), { width: shelf.columns, height: shelf.rows }));
      return;
    }
    if (event.target !== canvas) return;
    event.preventDefault();
    dragStart = canvasCellFromEvent(event, canvas, shelf);
    dragDraft = draftFromCorners(dragStart, dragStart, shelf);
    dragMarker = document.createElement('div');
    dragMarker.className = 'drag-marker';
    canvas.append(dragMarker);
    canvas.setPointerCapture(event.pointerId);
    updateDragMarker(shelf, dragMarker, dragDraft);
  }, true);

  canvas.addEventListener('pointermove', event => {
    if (measuringPointer === event.pointerId && isMeasuring(shelf)) {
      event.preventDefault();
      updateMeasurement(shelf, null, canvasMeasurePointFromEvent(event, canvas, shelf), false, canvasMeasureSize(canvas));
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(activeMeasurement(shelf), { width: shelf.columns, height: shelf.rows }));
      return;
    }
    if (!dragDraft || !dragMarker) return;
    dragDraft = draftFromCorners(dragStart, canvasCellFromEvent(event, canvas, shelf), shelf);
    updateDragMarker(shelf, dragMarker, dragDraft);
  });

  canvas.addEventListener('pointerup', event => {
    if (measuringPointer === event.pointerId && isMeasuring(shelf)) {
      event.preventDefault();
      updateMeasurement(shelf, null, canvasMeasurePointFromEvent(event, canvas, shelf), true, canvasMeasureSize(canvas));
      measuringPointer = null;
      render();
      return;
    }
    if (!dragDraft || !dragMarker) return;
    const draft = dragDraft;
    dragMarker.remove();
    dragStart = null;
    dragDraft = null;
    dragMarker = null;
    applyDraftSelection(shelf, draft);
    render();
    els.packageName.focus();
  });

  canvas.addEventListener('pointercancel', () => {
    measuringPointer = null;
    if (dragMarker) dragMarker.remove();
    dragStart = null;
    dragDraft = null;
    dragMarker = null;
  });

  const draft = selectedDraft();
  if (draft && draft.shelf.id === shelf.id) {
    const marker = document.createElement('div');
    marker.className = 'draft-marker';
    marker.innerHTML = draftMarkerHtml(draft);
    updateDragMarker(shelf, marker, draftAtCell(
      { row: draft.row, column: draft.column },
      shelf,
      { width: draft.width, depth: draft.depth }
    ));
    marker.addEventListener('pointerdown', event => startDraftEdit(event, canvas, shelf, marker, draft));
    canvas.append(marker);
  }

  const floorStackGroups = kind === 'floor' ? findFloorStackGroups(shelf) : [];
  floorStackGroups.forEach(group => renderFloorStackGroup(canvas, shelf, group));

  shelf.packages.forEach(item => {
    if (shouldSkipFloorStackItem(floorStackGroups, item)) return;
    const rectangle = document.createElement('button');
    const selectedPackage = els.packageId.value === item.id;
    const editDraft = selectedPackage ? selectedPackageDraft(item) : null;
    const displayItem = editDraft
      ? {
        ...item,
        row_index: editDraft.row,
        column_index: editDraft.column,
        width_units: editDraft.width,
        depth_units: editDraft.depth
      }
      : item;
    rectangle.className = `package-rect ${selectedPackage ? 'selected' : ''}`;
    rectangle.classList.toggle('blocked-zone', isBlockedItem(displayItem));
    rectangle.classList.toggle('reserve-zone', isYellowZone(displayItem));
    rectangle.classList.toggle('stacked-zone', isStackedItem(displayItem));
    rectangle.type = 'button';
    rectangle.style.left = `${((displayItem.column_index - 1) / shelf.columns) * 100}%`;
    rectangle.style.top = `${((displayItem.row_index - 1) / shelf.rows) * 100}%`;
    rectangle.style.width = `${((displayItem.width_units || 1) / shelf.columns) * 100}%`;
    rectangle.style.height = `${((displayItem.depth_units || 1) / shelf.rows) * 100}%`;
    rectangle.dataset.tooltip = packageTooltip(displayItem);
    rectangle.setAttribute('aria-label', item.package_name);
    rectangle.innerHTML = packageHtml(displayItem, selectedPackage);
    rectangle.addEventListener('pointerdown', event => {
      if (!selectedPackage) return;
      startPackageEdit(event, canvas, shelf, item, rectangle, displayItem);
    });
    rectangle.addEventListener('click', event => {
      if (rectangle.dataset.dragged === 'true') {
        rectangle.dataset.dragged = 'false';
        return;
      }
      selectCell(shelf, item.row_index, item.column_index, item);
    });
    canvas.append(rectangle);
  });

  if (!shelf.packages.length && (!draft || draft.shelf.id !== shelf.id)) {
    const empty = document.createElement('div');
    empty.className = 'canvas-empty';
    empty.textContent = 'Available area';
    canvas.append(empty);
  }

  return canvas;
}

function findFloorStackGroups(shelf) {
  const packages = (shelf.packages || []).filter(item => !isZoneItem(item));
  const groups = [];
  const seen = new Set();

  packages.forEach(item => {
    if (seen.has(item.id)) return;
    const group = [item];
    seen.add(item.id);
    let expanded = true;
    while (expanded) {
      expanded = false;
      packages.forEach(candidate => {
        if (seen.has(candidate.id)) return;
        if (group.some(groupItem => rectsOverlap(packageRect(groupItem), packageRect(candidate)))) {
          group.push(candidate);
          seen.add(candidate.id);
          expanded = true;
        }
      });
    }
    if (group.length > 1) groups.push(group);
  });

  return groups;
}

function floorStackGroupRect(group) {
  const left = Math.min(...group.map(item => item.column_index || 1));
  const top = Math.min(...group.map(item => item.row_index || 1));
  const right = Math.max(...group.map(item => (item.column_index || 1) + (item.width_units || 1)));
  const bottom = Math.max(...group.map(item => (item.row_index || 1) + (item.depth_units || 1)));
  return { column: left, row: top, width: right - left, depth: bottom - top };
}

function renderFloorStackGroup(canvas, shelf, group) {
  const rect = floorStackGroupRect(group);
  const button = document.createElement('button');
  button.className = 'package-rect floor-stack-group';
  button.type = 'button';
  button.style.left = `${((rect.column - 1) / shelf.columns) * 100}%`;
  button.style.top = `${((rect.row - 1) / shelf.rows) * 100}%`;
  button.style.width = `${(rect.width / shelf.columns) * 100}%`;
  button.style.height = `${(rect.depth / shelf.rows) * 100}%`;
  button.dataset.tooltip = group.map(packageTooltip).join(' | ');
  button.setAttribute('aria-label', group.map(item => item.package_name).join(', '));
  const totalHeight = group.reduce((sum, item) => sum + stackTotalHeightCm(item), 0);
  button.innerHTML = `
    <span class="measure">${formatSizeCm(rect.width, rect.depth)} · h ${formatCm(totalHeight)} cm</span>
    <span class="pkg">${group.map(item => escapeHtml(item.package_name)).join('<br>')}</span>
    <span class="note">${group.map(item => `${escapeHtml(stackCount(item))}x ${formatCm(stackTotalHeightCm(item))} cm`).join(' · ')}</span>
  `;
  button.addEventListener('click', () => {
    const first = group[0];
    selectCell(shelf, first.row_index, first.column_index, first);
  });
  canvas.append(button);
}

function shouldSkipFloorStackItem(groups, item) {
  return groups.some(group => group.some(groupItem => groupItem.id === item.id));
}

function updateDragMarker(shelf, marker, draft) {
  marker.style.left = `${((draft.column - 1) / shelf.columns) * 100}%`;
  marker.style.top = `${((draft.row - 1) / shelf.rows) * 100}%`;
  marker.style.width = `${(draft.width / shelf.columns) * 100}%`;
  marker.style.height = `${(draft.depth / shelf.rows) * 100}%`;
}

function renderDimensionLabels(shelf, kind, role = planRole(shelf)) {
  const labels = document.createElement('div');
  labels.className = 'dimension-labels';
  labels.innerHTML = `
    <span class="dim dim-top">${formatCm(shelf.columns)} cm</span>
    <span class="dim dim-left">${formatCm(shelf.rows)} cm</span>
    ${kind === 'shelf' ? '<span class="dim dim-bays">600 cm length</span>' : ''}
  `;
  return labels;
}

function draftMarkerHtml(draft) {
  return `
    <span class="draft-size">${formatSizeCm(draft.width, draft.depth)}</span>
    <b data-handle="n"></b>
    <b data-handle="e"></b>
    <b data-handle="s"></b>
    <b data-handle="w"></b>
    <b data-handle="ne"></b>
    <b data-handle="se"></b>
    <b data-handle="sw"></b>
    <b data-handle="nw"></b>
  `;
}

function resizeDraftFromPointer(startDraft, handle, startPointer, event, canvas, shelf) {
  const rect = canvas.getBoundingClientRect();
  const deltaColumn = Math.round(((event.clientX - startPointer.x) / Math.max(1, rect.width)) * shelf.columns);
  const deltaRow = Math.round(((event.clientY - startPointer.y) / Math.max(1, rect.height)) * shelf.rows);
  let left = startDraft.column;
  let top = startDraft.row;
  let right = startDraft.column + startDraft.width - 1;
  let bottom = startDraft.row + startDraft.depth - 1;

  if (handle.includes('e')) right = clamp(right + deltaColumn, left, shelf.columns);
  if (handle.includes('s')) bottom = clamp(bottom + deltaRow, top, shelf.rows);
  if (handle.includes('w')) left = clamp(left + deltaColumn, 1, right);
  if (handle.includes('n')) top = clamp(top + deltaRow, 1, bottom);

  return draftAtCell(
    { column: left, row: top },
    shelf,
    { width: right - left + 1, depth: bottom - top + 1 }
  );
}

function startDraftEdit(event, canvas, shelf, marker, draft) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.target.dataset.handle || 'move';
  const startCell = canvasCellFromEvent(event, canvas, shelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - draft.column,
    row: startCell.row - draft.row
  };
  let currentDraft = draft;

  const move = moveEvent => {
    const cell = canvasCellFromEvent(moveEvent, canvas, shelf);
    currentDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        shelf,
        { width: draft.width, depth: draft.depth }
      )
      : resizeDraftFromPointer(draft, handle, startPointer, moveEvent, canvas, shelf);

    const adjusted = setDraftFormValues(shelf, currentDraft);
    updateDragMarker(shelf, marker, adjusted);
    marker.querySelector('.draft-size').textContent = formatSizeCm(adjusted.width, adjusted.depth);
  };

  const finish = () => {
    marker.releasePointerCapture(event.pointerId);
    marker.removeEventListener('pointermove', move);
    marker.removeEventListener('pointerup', finish);
    marker.removeEventListener('pointercancel', finish);
    render();
  };

  marker.setPointerCapture(event.pointerId);
  marker.addEventListener('pointermove', move);
  marker.addEventListener('pointerup', finish);
  marker.addEventListener('pointercancel', finish);
}

function startRackDraftEdit(event, canvas, shelf, range, marker, localDraft) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.target.dataset.handle || 'move';
  const localShelf = { columns: range.width, rows: range.height };
  const startCell = canvasCellFromEvent(event, canvas, localShelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - localDraft.column,
    row: startCell.row - localDraft.row
  };

  const move = moveEvent => {
    const cell = canvasCellFromEvent(moveEvent, canvas, localShelf);
    const nextLocalDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        localShelf,
        { width: localDraft.width, depth: localDraft.depth }
      )
      : resizeDraftFromPointer(localDraft, handle, startPointer, moveEvent, canvas, localShelf);
    const adjusted = setDraftFormValues(shelf, rackGlobalDraft(shelf, range, nextLocalDraft));
    const adjustedLocal = rackLocalDraft({
      row: adjusted.row,
      column: adjusted.column,
      width: adjusted.width,
      depth: adjusted.depth
    }, range);
    updateDragMarker(localShelf, marker, adjustedLocal);
    marker.querySelector('.draft-size').textContent = formatSizeCm(adjusted.width, adjusted.depth);
  };

  const finish = () => {
    marker.releasePointerCapture(event.pointerId);
    marker.removeEventListener('pointermove', move);
    marker.removeEventListener('pointerup', finish);
    marker.removeEventListener('pointercancel', finish);
    render();
  };

  marker.setPointerCapture(event.pointerId);
  marker.addEventListener('pointermove', move);
  marker.addEventListener('pointerup', finish);
  marker.addEventListener('pointercancel', finish);
}

function startRackPackageEdit(event, canvas, shelf, range, item, rectangle, displayItem) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.target.dataset.handle || 'move';
  const localShelf = { columns: range.width, rows: range.height };
  const localDraft = rackLocalDraft({
    row: displayItem.row_index,
    column: displayItem.column_index,
    width: displayItem.width_units || 1,
    depth: displayItem.depth_units || 1
  }, range);
  const startCell = canvasCellFromEvent(event, canvas, localShelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - localDraft.column,
    row: startCell.row - localDraft.row
  };
  let moved = false;

  const move = moveEvent => {
    const distance = Math.hypot(moveEvent.clientX - startPointer.x, moveEvent.clientY - startPointer.y);
    if (!moved && distance < 6) return;
    moved = true;
    const cell = canvasCellFromEvent(moveEvent, canvas, localShelf);
    const nextLocalDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        localShelf,
        { width: localDraft.width, depth: localDraft.depth }
      )
      : resizeDraftFromPointer(localDraft, handle, startPointer, moveEvent, canvas, localShelf);
    const adjusted = setPackageEditFormValues(shelf, rackGlobalDraft(shelf, range, nextLocalDraft));
    const adjustedLocal = rackLocalDraft({
      row: adjusted.row,
      column: adjusted.column,
      width: adjusted.width,
      depth: adjusted.depth
    }, range);
    updateDragMarker(localShelf, rectangle, adjustedLocal);
    rectangle.querySelector('.measure').textContent = formatSizeCm(adjusted.width, adjusted.depth);
  };

  const finish = () => {
    rectangle.releasePointerCapture(event.pointerId);
    rectangle.removeEventListener('pointermove', move);
    rectangle.removeEventListener('pointerup', finish);
    rectangle.removeEventListener('pointercancel', finish);
    if (moved) {
      rectangle.dataset.dragged = 'true';
      render();
    }
  };

  rectangle.setPointerCapture(event.pointerId);
  rectangle.addEventListener('pointermove', move);
  rectangle.addEventListener('pointerup', finish);
  rectangle.addEventListener('pointercancel', finish);
}

function startPackageEdit(event, canvas, shelf, item, rectangle, displayItem) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.target.dataset.handle || 'move';
  const draft = {
    row: displayItem.row_index,
    column: displayItem.column_index,
    width: displayItem.width_units || 1,
    depth: displayItem.depth_units || 1
  };
  const startCell = canvasCellFromEvent(event, canvas, shelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - draft.column,
    row: startCell.row - draft.row
  };
  let moved = false;

  const move = moveEvent => {
    const distance = Math.hypot(moveEvent.clientX - startPointer.x, moveEvent.clientY - startPointer.y);
    if (!moved && distance < 6) return;
    moved = true;
    const cell = canvasCellFromEvent(moveEvent, canvas, shelf);
    const nextDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        shelf,
        { width: draft.width, depth: draft.depth }
      )
      : resizeDraftFromPointer(draft, handle, startPointer, moveEvent, canvas, shelf);
    const adjusted = setPackageEditFormValues(shelf, nextDraft);
    displayItem.row_index = adjusted.row;
    displayItem.column_index = adjusted.column;
    displayItem.width_units = adjusted.width;
    displayItem.depth_units = adjusted.depth;
    updateDragMarker(shelf, rectangle, adjusted);
    rectangle.querySelector('.measure').textContent = formatSizeCm(adjusted.width, adjusted.depth);
  };

  const finish = () => {
    rectangle.releasePointerCapture(event.pointerId);
    rectangle.removeEventListener('pointermove', move);
    rectangle.removeEventListener('pointerup', finish);
    rectangle.removeEventListener('pointercancel', finish);
    if (moved) {
      rectangle.dataset.dragged = 'true';
      render();
    }
  };

  rectangle.setPointerCapture(event.pointerId);
  rectangle.addEventListener('pointermove', move);
  rectangle.addEventListener('pointerup', finish);
  rectangle.addEventListener('pointercancel', finish);
}

function startPackageMove(event, canvas, shelf, item, rectangle) {
  event.preventDefault();
  event.stopPropagation();
  const startPointer = {
    x: event.clientX,
    y: event.clientY
  };
  const size = {
    width: item.width_units || 1,
    depth: item.depth_units || 1
  };
  const grabCell = canvasCellFromEvent(event, canvas, shelf);
  const grabOffset = {
    column: grabCell.column - item.column_index,
    row: grabCell.row - item.row_index
  };
  let moved = false;
  let draft = draftAtCell({ column: item.column_index, row: item.row_index }, shelf, size);
  const move = moveEvent => {
    const distance = Math.hypot(moveEvent.clientX - startPointer.x, moveEvent.clientY - startPointer.y);
    if (!moved && distance < 8) return;
    moved = true;
    const cell = canvasCellFromEvent(moveEvent, canvas, shelf);
    draft = draftAtCell({
      column: cell.column - grabOffset.column,
      row: cell.row - grabOffset.row
    }, shelf, size);
    updateDragMarker(shelf, rectangle, draft);
  };
  const finish = async () => {
    rectangle.releasePointerCapture(event.pointerId);
    rectangle.removeEventListener('pointermove', move);
    rectangle.removeEventListener('pointerup', finish);
    rectangle.removeEventListener('pointercancel', finish);
    if (!moved) return;
    rectangle.dataset.dragged = 'true';
    await movePackage(shelf, item, draft).catch(error => {
      showMessage(error.message, 'error');
      loadShelves();
    });
  };
  rectangle.setPointerCapture(event.pointerId);
  rectangle.addEventListener('pointermove', move);
  rectangle.addEventListener('pointerup', finish);
  rectangle.addEventListener('pointercancel', finish);
}

async function movePackage(shelf, item, draft) {
  const savingShelf = shelfForSaving(shelf);
  const payload = {
    packageId: item.id,
    locationType: placeKind(shelf),
    shelfName: shelf.name,
    shelfRows: cmInputToMeters(savingShelf.rows, savingShelf.rows),
    shelfColumns: cmInputToMeters(savingShelf.columns, savingShelf.columns),
    rowIndex: draft.row,
    columnIndex: draft.column,
    widthUnits: cmInputToMeters(item.width_units || 1, item.width_units || 1),
    depthUnits: cmInputToMeters(item.depth_units || 1, item.depth_units || 1),
    heightUnits: itemHeightCm(item),
    packageName: item.package_name,
    quantity: item.quantity,
    note: noteWithHeight(cleanHeightFromNote(item.note || ''), itemHeightCm(item))
  };
  await apiFetch('/api/regale', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  showMessage('Item moved.');
  await loadShelves();
}

function renderModel3d(shelves) {
  if (!els.model3d) return;
  els.model3d.classList.toggle('hidden', !appState.model3d.active);
  els.view3dButton?.classList.toggle('active', appState.model3d.active);
  if (!appState.model3d.active) {
    els.model3d.innerHTML = '';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'model3d-grid';

  shelves.forEach(shelf => {
    const view = modelViewState(shelf.id);
    const card = document.createElement('section');
    card.className = 'model3d-card';
    card.innerHTML = `
      <div class="model3d-head">
        <strong>${escapeHtml(shelf.label || shelf.name)}</strong>
        <span>${escapeHtml(modelHeightSummary(shelf))}</span>
        <div class="model3d-controls" aria-label="3D zoom controls">
          <button type="button" data-model-zoom="in">+</button>
          <button type="button" data-model-zoom="out">-</button>
          <button type="button" data-model-zoom="reset">Reset</button>
        </div>
      </div>
    `;

    const viewport = document.createElement('div');
    viewport.className = 'model3d-viewport';
    if (!window.THREE) {
      const missing = document.createElement('div');
      missing.className = 'model3d-missing';
      missing.textContent = '3D library could not be loaded.';
      viewport.append(missing);
    } else {
      createThreeAreaScene(viewport, shelf, view);
    }

    card.append(viewport);
    grid.append(card);
    attachModel3dZoomButtons(card, view);
  });

  els.model3d.innerHTML = '';
  els.model3d.append(grid);
}

function modelHeightSummary(shelf) {
  if (placeKind(shelf) === 'floor') return 'max height 100 cm';
  return 'max height 65 cm / small 16 cm';
}

function modelViewState(id) {
  if (!appState.model3d.views[id]) {
    appState.model3d.views[id] = {
      azimuth: -38,
      elevation: 48,
      zoom: 1.25,
      targetX: 0,
      targetY: 0.25,
      targetZ: 0,
      update: null
    };
  }
  return appState.model3d.views[id];
}

function createThreeAreaScene(viewport, shelf, view) {
  const widthCm = Math.max(1, shelf.columns || 1);
  const depthCm = Math.max(1, effectiveRowsForShelf(shelf) || shelf.rows || 1);
  const maxDim = Math.max(widthCm, depthCm, 100);
  const scale = 8 / maxDim;
  const heightScale = scale * 1.2;
  const areaWidth = widthCm * scale;
  const areaDepth = depthCm * scale;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f8f8);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.append(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: placeKind(shelf) === 'floor' ? 0xf4efe6 : 0xe9f4f4,
    roughness: 0.82,
    metalness: 0.02
  });
  const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(areaWidth, 0.08, areaDepth), floorMaterial);
  floorMesh.position.y = -0.04;
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(floorMesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x6f7d80, transparent: true, opacity: 0.55 })
  );
  edge.position.copy(floorMesh.position);
  root.add(edge);

  const grid = new THREE.GridHelper(Math.max(areaWidth, areaDepth), 12, 0xa8b6b8, 0xd2dddd);
  grid.scale.x = areaWidth / Math.max(areaWidth, areaDepth);
  grid.scale.z = areaDepth / Math.max(areaWidth, areaDepth);
  grid.position.y = 0.02;
  root.add(grid);

  (shelf.packages || []).forEach(item => renderThreeItem(root, item, scale, heightScale, widthCm, depthCm));

  const ambient = new THREE.HemisphereLight(0xffffff, 0xa8a09a, 2.1);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(7, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.75);
  fill.position.set(-5, 4, -4);
  scene.add(fill);

  const labels = buildModel3dLabels(shelf);
  viewport.append(labels);

  const update = () => {
    const distance = clamp(12 / view.zoom, 2.2, 34);
    const azimuth = (view.azimuth * Math.PI) / 180;
    const elevation = (view.elevation * Math.PI) / 180;
    const target = new THREE.Vector3(view.targetX, view.targetY, view.targetZ);
    camera.position.set(
      target.x + (distance * Math.cos(elevation) * Math.sin(azimuth)),
      target.y + (distance * Math.sin(elevation)),
      target.z + (distance * Math.cos(elevation) * Math.cos(azimuth))
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  };
  view.update = update;

  const resize = () => {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    update();
  };
  resize();
  requestAnimationFrame(resize);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
  } else {
    window.addEventListener('resize', resize);
  }
  attachModel3dControls(viewport, view, camera);
}

function renderThreeItem(root, item, scale, heightScale, widthCm, depthCm) {
  const zone = zoneKind(item);
  const count = zone ? 1 : Math.min(stackCount(item), 12);
  const height = zone ? 3 : itemHeightCm(item);
  const boxWidth = Math.max(0.06, (item.width_units || 1) * scale);
  const boxDepth = Math.max(0.06, (item.depth_units || 1) * scale);
  const layerHeight = Math.max(0.06, height * heightScale);
  const x = (((item.column_index || 1) - 1) + ((item.width_units || 1) / 2) - (widthCm / 2)) * scale;
  const z = (((item.row_index || 1) - 1) + ((item.depth_units || 1) / 2) - (depthCm / 2)) * scale;
  const color = zone === 'red' ? 0xea8a96 : zone === 'yellow' ? 0xf2d16d : 0xe6a447;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.64,
    metalness: 0.04,
    transparent: Boolean(zone),
    opacity: zone ? 0.46 : 0.96
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: zone === 'red' ? 0x9f2331 : 0x5f4327, transparent: true, opacity: 0.55 });

  for (let index = 0; index < count; index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(boxWidth, layerHeight, boxDepth), material);
    mesh.position.set(x, (layerHeight / 2) + (index * layerHeight), z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
    outline.position.copy(mesh.position);
    root.add(outline);
  }
}

function buildModel3dLabels(shelf) {
  const labels = document.createElement('div');
  labels.className = 'model3d-labels';
  labels.innerHTML = `
    <span class="model3d-area-label">${escapeHtml(shelf.label || shelf.name)}</span>
    ${(shelf.packages || []).slice(0, 10).map(item => `
      <span class="${zoneKind(item) ? 'zone-label' : ''}">
        ${escapeHtml(item.package_name)}
        ${zoneKind(item) ? escapeHtml(zoneKind(item)) : `${formatCm(stackTotalHeightCm(item))} cm`}
      </span>
    `).join('')}
  `;
  return labels;
}

function attachModel3dControls(viewport, view, camera) {
  let pointer = null;
  viewport.addEventListener('contextmenu', event => event.preventDefault());
  viewport.addEventListener('pointerdown', event => {
    event.preventDefault();
    const panMode = event.button === 2 || event.ctrlKey || event.metaKey;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      azimuth: view.azimuth,
      elevation: view.elevation,
      targetX: view.targetX,
      targetY: view.targetY,
      targetZ: view.targetZ,
      panMode
    };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (pointer.panMode) {
      const panScale = 0.018 / Math.max(0.5, view.zoom);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-dx * panScale);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * panScale);
      const move = right.add(up);
      view.targetX = pointer.targetX + move.x;
      view.targetY = pointer.targetY + move.y;
      view.targetZ = pointer.targetZ + move.z;
    } else {
      view.azimuth = pointer.azimuth - (dx * 0.32);
      view.elevation = clamp(pointer.elevation + (dy * 0.24), 12, 78);
    }
    view.update?.();
  });
  const clear = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null;
  };
  viewport.addEventListener('pointerup', clear);
  viewport.addEventListener('pointercancel', clear);
  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    view.zoom = clamp(view.zoom - (event.deltaY * 0.003), 0.35, 7);
    view.update?.();
  }, { passive: false });
}

function attachModel3dZoomButtons(card, view) {
  card.querySelectorAll('[data-model-zoom]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.modelZoom;
      if (action === 'in') view.zoom = clamp(view.zoom + 0.45, 0.35, 7);
      if (action === 'out') view.zoom = clamp(view.zoom - 0.45, 0.35, 7);
      if (action === 'reset') {
        view.zoom = 1.25;
        view.azimuth = -38;
        view.elevation = 48;
        view.targetX = 0;
        view.targetY = 0.25;
        view.targetZ = 0;
      }
      view.update?.();
    });
  });
}

function renderPlaces() {
  const planPlacesList = appState.shelves.filter(planPlaceRole);
  const oldPlaces = appState.shelves.filter(place => !planPlaceRole(place));
  if (planPlacesList.length) {
    renderPlaceGroup('Current 3 areas', planPlacesList);
  }
  if (oldPlaces.length) {
    renderPlaceGroup('Old/other areas', oldPlaces, true);
  }
}

function renderPlaceGroup(title, places, muted = false) {
  const group = document.createElement('section');
  group.className = `place-group ${muted ? 'old-place-group' : ''}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.append(heading);
  places.forEach(place => {
    const kind = placeKind(place);
    const item = document.createElement('article');
    item.className = `place-item ${kind === 'floor' ? 'floor-place-item' : ''} ${muted ? 'old-place-item' : ''}`;
    item.innerHTML = `
      <div>
        <span class="place-type">${placeLabel(kind)}</span>
        <h3>${escapeHtml(place.label || place.name)}</h3>
        <p>${formatSizeCm(place.columns, place.rows)} · ${lengthSummary(place)}</p>
      </div>
      <div class="place-row-actions">
        <button class="ghost edit-place" type="button">Edit</button>
        <button class="ghost delete-place" type="button">Delete</button>
      </div>
    `;
    item.querySelector('.edit-place').addEventListener('click', () => selectPlace(place));
    item.querySelector('.delete-place').addEventListener('click', () => deletePlace(place.id).catch(error => {
      showMessage(error.message, 'error');
    }));
    group.append(item);
  });
  els.placeList.append(group);
}

function selectPlace(place) {
  els.placeId.value = place.id;
  els.placeLocationType.value = placeKind(place);
  els.placeName.value = place.name;
  els.placeRows.value = inputCm(place.rows);
  els.placeColumns.value = inputCm(place.columns);
  els.placeNotes.value = place.notes || '';
  els.savePlaceButton.textContent = 'Update area';
  els.cancelPlaceButton.classList.remove('hidden');
}

function renderOverview(shelves, shelfPlaces, floorPlaces) {
  const freeArea = totalFreeArea(shelves);
  const usedArea = shelves.reduce((sum, shelf) => sum + itemAreaCm2(shelf), 0);
  const zoneArea = shelves.reduce((sum, shelf) => sum + zoneAreaCm2(shelf), 0);
  const stackedCount = shelves.reduce((sum, shelf) => sum + shelf.packages.filter(isStackedItem).length, 0);
  const cards = [
    ['Free area', formatAreaCm2(freeArea), 'available floor/rack footprint'],
    ['Item area', formatAreaCm2(usedArea), 'normal items only'],
    ['Zone area', formatAreaCm2(zoneArea), 'red and yellow subtracted from free area'],
    ['Floor areas', floorPlaces.length, 'regular floor storage areas']
  ];

  cards.forEach(([label, value, hint]) => {
    const card = document.createElement('div');
    card.className = 'overview-card';
    card.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    `;
    els.overviewCards.append(card);
  });
  if (stackedCount) {
    els.summaryText.textContent += ` ${stackedCount} stacked positions marked.`;
  }
}

function renderWarehouseMap(shelfPlaces, floorPlaces) {
  const zones = [
    ['Rack 600 x 450', shelfPlaces],
    ['Floor area 1', floorPlaces.slice(0, 1)],
    ['Floor area 2', floorPlaces.slice(1)]
  ];

  zones.forEach(([label, places]) => {
    const zone = document.createElement('button');
    zone.className = `map-zone ${places.length ? '' : 'empty-zone'}`;
    zone.type = 'button';
    const free = totalFreeArea(places);
    const total = places.reduce((sum, shelf) => sum + ((shelf.columns || 0) * (effectiveRowsForShelf(shelf) || shelf.rows || 0)), 0);
    const usedPercent = total ? Math.round(((total - free) / total) * 100) : 0;
    zone.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${places.length ? `${formatAreaCm2(free)} free` : 'available for planning'}</strong>
      <i class="zone-meter" aria-hidden="true"><b style="width: ${usedPercent}%"></b></i>
    `;
    els.warehouseMap.append(zone);
  });
}

function setupPresetButton(button) {
  const [width, depth, height, name] = button.dataset.preset.split('|');
  const presetWidth = cmInputToCm(width, 100);
  const presetDepth = cmInputToCm(depth, 100);
  const visualWidth = clamp((presetWidth / 600) * 100, 8, 100);
  const visualDepth = clamp((presetDepth / 90) * 100, 8, 100);
  const isBlocked = /sperr|blocked/.test(String(name || '').toLowerCase());
  button.classList.add('preset-button');
  button.classList.toggle('blocked-preset', isBlocked);
  button.style.setProperty('--preset-w', `${visualWidth}%`);
  button.style.setProperty('--preset-h', `${visualDepth}%`);
  button.innerHTML = `
    <span class="preset-preview" aria-hidden="true"><i></i></span>
    <span class="preset-label">${escapeHtml(button.textContent.trim())}</span>
  `;
}

function packageHtml(item, selected = false) {
  const zone = zoneKind(item);
  const count = stackCount(item);
  const height = itemHeightCm(item);
  const note = cleanHeightFromNote(item.note || '');
  return `
    <span class="measure">${formatSizeCm(item.width_units || 1, item.depth_units || 1)} · h ${formatCm(count * height)} cm</span>
    <span class="pkg">${escapeHtml(item.package_name)}</span>
    <span class="note">${zone ? `${zone} zone, no item area` : `${escapeHtml(count)}x stacked${note ? ` · ${escapeHtml(note)}` : ''}`}</span>
    ${selected ? draftMarkerHtml({
      width: item.width_units || 1,
      depth: item.depth_units || 1
    }).replace('class="draft-size"', 'class="edit-size hidden"') : ''}
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadShelves() {
  if (!appState.token) {
    render();
    return;
  }
  const data = await apiFetch('/api/regale');
  appState.user = data.user;
  appState.shelves = data.shelves || [];
  render();
}

async function submitPackage(event) {
  event.preventDefault();
  normalizeDecimalFields(els.shelfRows, els.shelfColumns, els.widthUnits, els.depthUnits, els.heightUnits);
  updateDraftFromSizeInputs();
  const payload = Object.fromEntries(new FormData(els.packageForm).entries());
  const selectedShelf = appState.selected?.shelf;
  const payloadZone = zoneKind({ package_name: payload.packageName, note: payload.note });
  const height = cmInputToCm(payload.heightUnits, 45);
  const quantity = stackCount(payload.quantity);
  const totalHeight = height * quantity;
  const candidateRect = {
    row: cmInputToCm(payload.rowIndex, 1),
    column: cmInputToCm(payload.columnIndex, 1),
    width: cmInputToCm(payload.widthUnits, 100),
    depth: cmInputToCm(payload.depthUnits, 100)
  };
  if (selectedShelf && payloadZone !== 'red' && touchesForbiddenArea(selectedShelf, {
    row: candidateRect.row,
    column: candidateRect.column,
    width: candidateRect.width,
    depth: candidateRect.depth
  })) {
    showMessage('This red zone is blocked. Do not place items there.', 'error');
    return;
  }
  if (selectedShelf && !payloadZone) {
    const maxHeight = maxStackHeightForShelf(selectedShelf, {
      row: candidateRect.row,
      column: candidateRect.column
    });
    const existingOverlapHeight = floorStackOverlapHeight(selectedShelf, candidateRect, payload.packageId);
    const combinedHeight = totalHeight + existingOverlapHeight;
    if (combinedHeight > maxHeight) {
      showMessage(`Stack is too high: ${formatCm(combinedHeight)} cm total, max ${formatCm(maxHeight)} cm here.`, 'error');
      return;
    }
  }
  payload.quantity = quantity;
  payload.note = payloadZone ? cleanHeightFromNote(payload.note) : noteWithHeight(payload.note, height);
  payload.shelfRows = cmInputToMeters(payload.shelfRows, planPlaces.rack.rows);
  payload.shelfColumns = cmInputToMeters(payload.shelfColumns, 600);
  payload.widthUnits = cmInputToMeters(payload.widthUnits, 100);
  payload.depthUnits = cmInputToMeters(payload.depthUnits, 100);
  if (payload.locationType === 'floor' && !/boden|floor/.test(String(payload.shelfName || '').toLowerCase())) {
    payload.shelfName = `Floor - ${payload.shelfName}`;
  }
  const isEdit = Boolean(payload.packageId);
  await apiFetch('/api/regale', {
    method: isEdit ? 'PATCH' : 'POST',
    body: JSON.stringify(payload)
  });
  clearPackageForm();
  showMessage(isEdit ? 'Item moved/updated.' : 'Item saved.');
  await loadShelves();
}

async function submitPlace(event) {
  event.preventDefault();
  normalizeDecimalFields(els.placeRows, els.placeColumns);
  const payload = Object.fromEntries(new FormData(els.placeForm).entries());
  payload.rows = cmInputToMeters(payload.rows, planPlaces.rack.rows);
  payload.columns = cmInputToMeters(payload.columns, 600);
  const isEdit = Boolean(payload.id);
  await apiFetch('/api/places', {
    method: isEdit ? 'PATCH' : 'POST',
    body: JSON.stringify(payload)
  });
  clearPlaceForm();
  showMessage(isEdit ? 'Area updated.' : 'Area created.');
  await loadShelves();
}

async function deletePlace(id) {
  await apiFetch(`/api/places?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('Area deleted.');
  await loadShelves();
}

async function deleteAllPlaces() {
  const ok = window.confirm('Really delete all items and all areas?');
  if (!ok) return;

  const packageIds = appState.shelves.flatMap(shelf => shelf.packages.map(item => item.id));
  for (const id of packageIds) {
    await apiFetch(`/api/regale?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  for (const shelf of appState.shelves) {
    await apiFetch(`/api/places?id=${encodeURIComponent(shelf.id)}`, { method: 'DELETE' });
  }
  clearPackageForm();
  clearPlaceForm();
  showMessage('All areas deleted.');
  await loadShelves();
}

async function createDefaultPlanPlaces() {
  let created = 0;
  let updated = 0;
  for (const role of ['floor-main', 'rack', 'floor-long']) {
    const existing = appState.shelves.find(shelf => planPlaceRole(shelf) === role);
    if (existing && !placeNeedsPlanUpdate(existing, role)) continue;
    const result = await saveDefaultPlanPlace(role, existing);
    if (result === 'updated') updated += 1;
    if (result === 'created') created += 1;
  }
  if (!created && !updated) {
    showMessage('The 3 areas are already set up correctly.');
    return;
  }
  showMessage(`${created} area(s) created, ${updated} updated.`);
  await loadShelves();
}

async function createPlanPlace(role) {
  const existing = appState.shelves.find(shelf => planPlaceRole(shelf) === role);
  if (existing && !placeNeedsPlanUpdate(existing, role)) {
    showMessage(`${existing.name} is already set up correctly.`);
    return;
  }
  const result = await saveDefaultPlanPlace(role, existing);
  showMessage(`${planTitle(role)} ${result === 'updated' ? 'updated' : 'created'}.`);
  await loadShelves();
}

async function submitLogin(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.loginForm).entries());
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  appState.token = data.token;
  appState.user = data.user;
  localStorage.setItem(tokenKey, data.token);
  els.loginForm.reset();
  showMessage('Signed in successfully.');
  await loadShelves();
}

els.loginForm.addEventListener('submit', event => {
  submitLogin(event).catch(error => showMessage(error.message, 'error'));
});

els.logoutButton.addEventListener('click', () => {
  appState.token = '';
  appState.user = null;
  appState.shelves = [];
  localStorage.removeItem(tokenKey);
  render();
});

els.refreshButton.addEventListener('click', () => {
  loadShelves().catch(error => showMessage(error.message, 'error'));
});

els.view3dButton?.addEventListener('click', () => {
  appState.model3d.active = !appState.model3d.active;
  render();
});

if (els.defaultPlanButton) {
  els.defaultPlanButton.addEventListener('click', () => {
    createDefaultPlanPlaces().catch(error => showMessage(error.message, 'error'));
  });
}

els.packagesTab?.addEventListener('click', () => setActiveView('packages'));
els.placesTab?.addEventListener('click', () => setActiveView('places'));

els.packageForm.addEventListener('submit', event => {
  submitPackage(event).catch(error => showMessage(error.message, 'error'));
});

els.placeForm.addEventListener('submit', event => {
  submitPlace(event).catch(error => showMessage(error.message, 'error'));
});

els.cancelEditButton.addEventListener('click', () => {
  clearPackageForm();
  els.selectedCell.textContent = 'No area selected';
  render();
});

els.deletePackageButton.addEventListener('click', async () => {
  if (!els.packageId.value) return;
  await deletePackage(els.packageId.value).catch(error => showMessage(error.message, 'error'));
  clearPackageForm();
  els.selectedCell.textContent = 'No area selected';
});

els.cancelPlaceButton.addEventListener('click', clearPlaceForm);
els.deleteAllPlacesButton.addEventListener('click', () => {
  deleteAllPlaces().catch(error => showMessage(error.message, 'error'));
});
els.resetPlanButton.addEventListener('click', () => {
  deleteAllPlaces().catch(error => showMessage(error.message, 'error'));
});

document.querySelectorAll('[data-preset]').forEach(button => {
  setupPresetButton(button);
  button.addEventListener('click', () => {
    const [width, depth, height, name, quantity, note = ''] = button.dataset.preset.split('|');
    els.widthUnits.value = width;
    els.depthUnits.value = depth;
    els.heightUnits.value = height && height !== '0' ? height : 1;
    els.packageName.value = name;
    els.quantity.value = quantity;
    els.note.value = note;
    updateDraftFromSizeInputs();
  });
});

document.querySelectorAll('[data-zone-kind]').forEach(button => {
  button.classList.add('preset-button', `${button.dataset.zoneKind}-preset`);
  button.innerHTML = `
    <span class="preset-preview" aria-hidden="true"><i></i></span>
    <span class="preset-label">${escapeHtml(button.textContent.trim())}</span>
  `;
  button.addEventListener('click', () => {
    const kind = button.dataset.zoneKind === 'yellow' ? 'yellow' : 'red';
    els.packageName.value = kind === 'red' ? 'Red no-place zone' : 'Yellow reserve zone';
    els.quantity.value = 1;
    els.note.value = `zone:${kind}`;
    updateDraftFromSizeInputs();
  });
});

document.querySelectorAll('[data-place-preset]').forEach(button => {
  button.addEventListener('click', () => {
    const [name, type, rows, columns, notes] = button.dataset.placePreset.split('|');
    els.placeId.value = '';
    els.placeName.value = name;
    els.placeLocationType.value = type;
    els.placeRows.value = rows;
    els.placeColumns.value = columns;
    els.placeNotes.value = notes;
    els.savePlaceButton.textContent = 'Save area';
    els.cancelPlaceButton.classList.add('hidden');
  });
});

[els.shelfRows, els.shelfColumns, els.widthUnits, els.depthUnits, els.heightUnits, els.placeRows, els.placeColumns].forEach(input => {
  input.addEventListener('input', () => normalizeDecimalInput(input));
});
els.widthUnits.addEventListener('input', updateDraftFromSizeInputs);
els.depthUnits.addEventListener('input', updateDraftFromSizeInputs);
els.widthUnits.addEventListener('change', updateDraftFromSizeInputs);
els.depthUnits.addEventListener('change', updateDraftFromSizeInputs);

render();
loadShelves().catch(error => {
  showMessage(error.message, 'error');
  render();
});
