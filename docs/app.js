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
  backToOverviewButton: document.querySelector('#backToOverviewButton'),
  placeForm: document.querySelector('#placeForm'),
  placeId: document.querySelector('#placeId'),
  placeParentId: document.querySelector('#placeParentId'),
  placeLocationType: document.querySelector('#placeLocationType'),
  placeName: document.querySelector('#placeName'),
  placeRows: document.querySelector('#placeRows'),
  placeColumns: document.querySelector('#placeColumns'),
  placeDepthControl: document.querySelector('#placeDepthControl'),
  placeWidthControl: document.querySelector('#placeWidthControl'),
  placeHeight: document.querySelector('#placeHeight'),
  placeHeightControl: document.querySelector('#placeHeightControl'),
  rackModeValue: document.querySelector('#rackModeValue'),
  rackLayoutValue: document.querySelector('#rackLayoutValue'),
  rackStructureControls: document.querySelector('#rackStructureControls'),
  rackStructureList: document.querySelector('#rackStructureList'),
  addRackLevelButton: document.querySelector('#addRackLevelButton'),
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
  doorSideValue: document.querySelector('#doorSideValue'),
  doorFlippedValue: document.querySelector('#doorFlippedValue'),
  selectedCell: document.querySelector('#selectedCell'),
  locationType: document.querySelector('#locationType'),
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
  doorSideControls: document.querySelector('#doorSideControls'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  toggleFitFinderButton: document.querySelector('#toggleFitFinderButton'),
  fitFinderForm: document.querySelector('#fitFinderForm'),
  fitWidth: document.querySelector('#fitWidth'),
  fitDepth: document.querySelector('#fitDepth'),
  fitHeight: document.querySelector('#fitHeight'),
  fitResults: document.querySelector('#fitResults')
};

let appState = {
  token: localStorage.getItem(tokenKey) || '',
  user: null,
  shelves: [],
  selected: null,
  activeView: 'packages',
  activeAreaId: '',
  activePlanRole: 'floor-main',
  activeRackLevel: 1,
  measurement: null,
  fitFinder: {
    open: false,
    searched: false,
    matches: []
  },
  model3d: {
    active: false,
    zoom: 1,
    views: {},
    rackLevels: {}
  }
};
let shelfVolumeCache = new WeakMap();

const planPlaces = {
  'floor-main': {
    title: 'Floor area 1 - 8,800 x 3,800 mm',
    rows: 380,
    columns: 880,
    notes: 'max-height-mm:2200'
  },
  rack: {
    title: 'Rack 6,000 x 900 mm',
    rows: 90,
    columns: 600,
    notes: 'rack-mode:custom; max-height-mm:650'
  },
  'floor-long': {
    title: 'Floor area 2 - 3,800 x 7,400 mm',
    rows: 740,
    columns: 380,
    notes: 'max-height-mm:2200'
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

function readableThousands(value) {
  return String(value || '').replace(/(\d)\.(?=\d{3}\b)/g, '$1,');
}

function displayAreaName(value) {
  return readableThousands(String(value || '')
    .replace(/bodenplatz/gi, 'Floor area')
    .replace(/lagerfl[aä]che/gi, 'Storage area')
    .replace(/fl[aä]che/gi, 'Area')
    .replace(/regal/gi, 'Rack')
    .replace(/\b880\s*x\s*380\b(?:\s*cm)?/g, '8,800 x 3,800 mm')
    .replace(/\b380\s*x\s*740\b(?:\s*cm)?/g, '3,800 x 7,400 mm')
    .replace(/\b600\s*x\s*450\b(?:\s*cm)?/g, '6,000 x 4,500 mm')
    .replace(/\b600\s*x\s*90\b(?:\s*cm)?/g, '6,000 x 900 mm'));
}

function packageTooltip(item) {
  const zone = zoneKind(item);
  const kind = specialKind(item);
  if (kind === 'door') {
    return 'Door';
  }
  if (zone) {
    const isRed = zone === 'red';
    const purpose = zonePurposeNote(item.note) || (isRed ? 'Reserved restricted area' : 'Reserved area');
    return [
      displayPackageName(item) || (isRed ? 'Red no-place zone' : 'Yellow reserve zone'),
      `Size: ${formatSizeCm(item.width_units || 1, item.depth_units || 1)}`,
      `Height: ${formatNumber(itemHeightCm(item) * 10)} mm`,
      kind === 'column' ? 'Pillar: no items allowed' : kind === 'corridor' ? 'Corridor: reserved route' : isRed ? 'No items allowed' : 'Only for defined items',
      purpose
    ].join('\n');
  }
  const height = itemHeightCm(item);
  const count = stackCount(item);
  const parts = [
    displayPackageName(item),
    formatSizeCm(item.width_units || 1, item.depth_units || 1),
    zone ? `${zone} zone` : `${count}x stacked, ${formatNumber(height * 10)} mm each, ${formatNumber(count * height * 10)} mm total`
  ];
  if (isStackedItem(item)) parts.push('stacked');
  const note = displayItemNote(item.note || '');
  if (note) parts.push(note);
  return parts.filter(Boolean).join(' | ');
}

function displayPackageName(item) {
  if (specialKind(item) === 'column') return 'Pillar';
  const name = String(item?.package_name || '');
  if (/^pallet\s+[0-9.,]+\s*x\s*[0-9.,]+(?:\s*x\s*[0-9.,]+)?\s*mm$/i.test(name)) {
    return `Pallet ${formatNumber((item.width_units || 1) * 10)} x ${formatNumber((item.depth_units || 1) * 10)} x ${formatNumber(itemHeightCm(item) * 10)} mm`;
  }
  return readableThousands(name);
}

function zonePurposeNote(note) {
  return String(note || '')
    .replace(/zone\s*:\s*(red|yellow)/gi, '')
    .replace(/element\s*:\s*(column|corridor|door)/gi, '')
    .replace(/height\s*[0-9]+(?:[.,][0-9]+)?\s*cm/gi, '')
    .replace(/^[\s|·,;:-]+|[\s|·,;:-]+$/g, '')
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberValue(value, fallback) {
  const text = String(value ?? '').trim();
  let normalized = text;
  if (text.includes(',') && text.includes('.')) {
    const decimalSeparator = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    normalized = decimalSeparator === ','
      ? text.replaceAll('.', '').replace(',', '.')
      : text.replaceAll(',', '');
  } else if (/^[+-]?[1-9]\d{0,2}(?:,\d{3})+$/.test(text)) {
    normalized = text.replaceAll(',', '');
  } else if (/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text)) {
    normalized = text.replaceAll('.', '');
  } else if (text.includes(',')) {
    normalized = text.replace(',', '.');
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDecimal(value) {
  return Number(value).toFixed(5).replace(/\.?0+$/, '');
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(Number(value) || 0);
}

function formatSizeCm(width, depth) {
  return `${formatNumber(width * 10)} x ${formatNumber(depth * 10)} mm`;
}

function formatMeasureCm(cm) {
  return `${formatNumber(cm * 10)} mm`;
}

function formatVolumeMm3(volumeCm3) {
  return `${formatNumber(Math.max(0, Number(volumeCm3) || 0) * 1000)} mm³`;
}

function formatAreaMm2(areaCm2) {
  return `${formatNumber(Math.max(0, Number(areaCm2) || 0) * 100)} mm²`;
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
  return formatNumber(cm * 10);
}

function cmInputToCm(value, fallbackCm = 100) {
  return Math.max(0.1, numberValue(value, fallbackCm * 10) / 10);
}

function internalCm(value, fallbackCm = 100) {
  return Math.max(1, numberValue(value, fallbackCm));
}

function cmInputToMeters(value, fallbackCm = 100) {
  return formatDecimal(cmInputToCm(value, fallbackCm) / 100);
}

function internalCmToMeters(value, fallbackCm = 100) {
  return formatDecimal(internalCm(value, fallbackCm) / 100);
}

function itemHeightCm(item, fallback = 45) {
  const note = String(item?.note || '');
  const match = note.match(/height\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i) || note.match(/höhe\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  return internalCm(match?.[1], fallback);
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
  const heightText = `height ${formatDecimal(height)} cm`;
  return clean ? `${clean}, ${heightText}` : heightText;
}

function stackPlacement(itemOrNote) {
  const note = typeof itemOrNote === 'object' ? itemOrNote?.note : itemOrNote;
  return String(note || '').match(/stack-order\s*:\s*(below|above)/i)?.[1]?.toLowerCase() || '';
}

function stackBaseHeightCm(itemOrNote) {
  const note = typeof itemOrNote === 'object' ? itemOrNote?.note : itemOrNote;
  const valueMm = numberValue(String(note || '').match(/stack-base-mm\s*:\s*([0-9.,]+)/i)?.[1], -1);
  return valueMm >= 0 ? valueMm / 10 : null;
}

function cleanStackMetadata(note) {
  return String(note || '')
    .replace(/(?:,\s*)?stack-order\s*:\s*(below|above)/gi, '')
    .replace(/(?:,\s*)?stack-base-mm\s*:\s*[0-9.,]+/gi, '')
    .replace(/^,\s*|\s*,$/g, '')
    .trim();
}

function noteWithStackPlacement(note, placement, baseHeightCm = null) {
  const clean = cleanStackMetadata(note);
  const baseMarker = baseHeightCm === null ? '' : `, stack-base-mm:${formatDecimal(baseHeightCm * 10)}`;
  const marker = `stack-order:${placement}${baseMarker}`;
  return clean ? `${clean}, ${marker}` : marker;
}

function displayItemNote(note) {
  return readableThousands(cleanStackMetadata(cleanHeightFromNote(note)));
}

function orderedForStacking(items) {
  const priority = item => stackPlacement(item) === 'below' ? -1 : stackPlacement(item) === 'above' ? 1 : 0;
  return [...(items || [])].sort((a, b) => priority(a) - priority(b));
}

function stackCount(itemOrValue) {
  const value = typeof itemOrValue === 'object' ? itemOrValue.quantity : itemOrValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function stackTotalHeightCm(item) {
  return stackCount(item) * itemHeightCm(item);
}

function areaMaxHeightCm(shelf, fallback = 220) {
  const notes = String(shelf?.notes || '');
  const mmMarker = notes.match(/max-height-mm\s*:\s*([0-9.,]+)/i);
  if (mmMarker) return Math.max(0.1, numberValue(mmMarker[1], fallback * 10) / 10);
  const visibleMm = notes.match(/max(?:imum)?\s*height\s*([0-9.,]+)\s*mm/i);
  if (visibleMm) return Math.max(0.1, numberValue(visibleMm[1], fallback * 10) / 10);
  const legacyCm = notes.match(/max(?:imum)?\s*height\s*([0-9.,]+)\s*cm/i);
  if (legacyCm) return Math.max(0.1, numberValue(legacyCm[1], fallback));
  return fallback;
}

function notesWithAreaMaxHeight(notes, heightCm) {
  const clean = String(notes || '')
    .replace(/(?:[;,]\s*)?max-height-mm\s*:\s*[0-9.,]+/gi, '')
    .replace(/(?:[;,]\s*)?max(?:imum)?\s*height\s*[0-9.,]+\s*(?:mm|cm)/gi, '')
    .replace(/^[\s;,]+|[\s;,]+$/g, '')
    .trim();
  const marker = `max-height-mm:${formatDecimal(heightCm * 10)}`;
  return clean ? `${clean}; ${marker}` : marker;
}

function maxStackHeightForShelf(shelf, candidate = {}) {
  if (placeKind(shelf) === 'floor') return areaMaxHeightCm(shelf, 220);
  if (parentRackId(shelf) || planPlaceRole(shelf) !== 'rack') return areaMaxHeightCm(shelf, 65);
  const row = candidate.row ?? candidate.rowIndex ?? 1;
  const column = candidate.column ?? candidate.columnIndex ?? 1;
  if (isCustomRack(shelf)) {
    const level = rackLevelSpecs(shelf).find(spec => row >= spec.start && row <= spec.end && column >= spec.xStart && column <= spec.xEnd);
    return level?.maxHeight || 0.1;
  }
  const smallColumnStart = Math.max(1, (shelf.columns || 600) - 149);
  return row >= 361 && column >= smallColumnStart ? 16 : 65;
}

function lengthSummary(shelf) {
  return formatVolumeMm3(freeVolumeCm3(shelf));
}

function shelfFreePercent(shelf) {
  const capacity = totalCapacityCm3(shelf);
  return capacity ? (freeVolumeCm3(shelf) / capacity) * 100 : 0;
}

function rackLevelSpecs(shelf) {
  if (isCustomRack(shelf)) {
    return [...rackLayoutFromNotes(shelf)]
      .sort((a, b) => a.slot - b.slot)
      .map(level => {
        const start = level.start;
        const end = start + level.depth - 1;
        return {
          level: `custom:${level.id}`,
          layoutId: level.id,
          slot: level.slot,
          label: level.name,
          start,
          end,
          xStart: 1,
          xEnd: level.width,
          short: false,
          maxHeight: level.height,
          heightLabel: `${formatSizeCm(level.width, level.depth)} x ${formatNumber(level.height * 10)} mm high`
        };
      });
  }
  const width = Math.max(1, shelf.columns || planPlaces.rack.columns);
  const height = Math.max(planPlaces.rack.rows, shelf.rows || planPlaces.rack.rows);
  const widthMm = formatNumber(width * 10);
  const levelDepth = 90;
  const levelRange = index => {
    const start = ((index - 1) * levelDepth) + 1;
    const end = Math.min(index * levelDepth, height);
    return { start, end };
  };
  const small = levelRange(5);
  return [
    { level: 1, label: 'Rack level 1', ...levelRange(1), xStart: 1, xEnd: width, short: false, heightLabel: `${widthMm} x 900 x 650 mm` },
    { level: 2, label: 'Rack level 2', ...levelRange(2), xStart: 1, xEnd: width, short: false, heightLabel: `${widthMm} x 900 x 650 mm` },
    { level: 3, label: 'Rack level 3', ...levelRange(3), xStart: 1, xEnd: width, short: false, heightLabel: `${widthMm} x 900 x 650 mm` },
    { level: 5, label: 'Small rack', ...small, xStart: Math.max(1, width - 149), xEnd: width, short: true, heightLabel: `${formatNumber(Math.min(150, width) * 10)} x 900 x 160 mm` }
  ];
}

function rackLevelRange(shelf, level) {
  const fallback = rackLevelSpecs(shelf)[0];
  const spec = rackLevelSpecs(shelf).find(item => String(item.level) === String(level)) || fallback;
  if (!spec) return { level, label: 'No sub-rack', start: 1, end: 1, xStart: 1, xEnd: 1, height: 1, width: 1, maxHeight: 0.1 };
  return {
    ...spec,
    height: Math.max(1, spec.end - spec.start + 1),
    width: Math.max(1, spec.xEnd - spec.xStart + 1)
  };
}

function effectiveRowsForShelf(shelf) {
  if (isCustomRack(shelf)) return Math.max(1, shelf.rows || 1);
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

function rackLevelPackages(shelf, range) {
  return shelf.packages
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
    });
}

function packageRect(item) {
  return {
    column: item.column_index,
    row: item.row_index,
    width: item.width_units || 1,
    depth: item.depth_units || 1
  };
}

function rackLevelSlice(shelf, level) {
  const range = rackLevelRange(shelf, level);
  return {
    ...shelf,
    isRackLevelSlice: true,
    sliceMaxHeight: range.maxHeight || (range.short ? 16 : 65),
    rows: range.height,
    columns: range.width,
    packages: rackLevelPackages(shelf, range)
  };
}

function rackLevelFreeVolumeCm3(shelf, level) {
  return freeVolumeCm3(rackLevelSlice(shelf, level));
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

function rackLevelRotated(range) {
  return typeof range.rotated === 'boolean' ? range.rotated : range.width > range.height;
}

function rackVisualShelf(range) {
  return rackLevelRotated(range)
    ? { columns: range.height, rows: range.width }
    : { columns: range.width, rows: range.height };
}

function rackLocalToVisual(draft, range) {
  if (!rackLevelRotated(range)) return { ...draft };
  return {
    column: draft.row,
    row: draft.column,
    width: draft.depth,
    depth: draft.width
  };
}

function rackVisualToLocal(draft, range) {
  if (!rackLevelRotated(range)) return { ...draft };
  return {
    column: draft.row,
    row: draft.column,
    width: draft.depth,
    depth: draft.width
  };
}

function rackPhysicalMeasurePoint(point, range) {
  return rackLevelRotated(range) ? { column: point.row, row: point.column } : point;
}

function rackVisualMeasurement(measurement, range) {
  if (!measurement || !rackLevelRotated(range)) return measurement;
  const swap = point => point ? { column: point.row, row: point.column } : point;
  return {
    ...measurement,
    start: swap(measurement.start),
    current: swap(measurement.current),
    end: swap(measurement.end)
  };
}

function updateRackDoorSideFromPointer(event, canvas, range) {
  updateDoorSideFromPointer(event, canvas);
  if (draftSpecialKind() !== 'door' || !rackLevelRotated(range)) return;
  els.doorSideValue.value = ({ top: 'left', bottom: 'right', left: 'top', right: 'bottom' })[els.doorSideValue.value] || els.doorSideValue.value;
}

function rackPackageLabelFits(width, depth) {
  return width >= 48 && depth >= 18;
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
    const shelf = appState.shelves.find(item => String(item.id) === String(measurement.shelfId));
    if (!shelf) return '';
    const localColumn = Math.min(measurement.start.column, end.column);
    const localRow = Math.min(measurement.start.row, end.row);
    const range = measurement.level ? rackLevelRange(shelf, measurement.level) : null;
    const bounds = {
      column: (range ? range.xStart : 1) + localColumn,
      row: (range ? range.start : 1) + localRow,
      width: Math.abs(width),
      depth: Math.abs(depth)
    };
    const freeVolume = freeVolumeInBoundsCm3(shelf, bounds);
    const measuredRegions = usableRegions(shelf).filter(region => rectIntersection(region, bounds));
    const hasContent = shelf.packages.some(item => !isDoorItem(item) && rectIntersection(packageRect(item), bounds));
    const heightText = !hasContent && measuredRegions.length === 1
      ? ` x ${formatNumber(measuredRegions[0].maxHeight * 10)} mm`
      : ' · remaining height deducted locally';
    return `${formatNumber(Math.abs(width) * 10)} x ${formatNumber(Math.abs(depth) * 10)}${heightText} = ${formatVolumeMm3(freeVolume)}`;
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
      const collision = shelf.packages.some(item => !isDoorItem(item) && !isYellowZone(item) && rectsOverlap(draftRect(draft), packageRect(item)));
      if (!collision) return draft;
    }
  }

  const fallback = { row: range.start, column: range.xStart, width, depth };
  return shelf.packages.some(item => !isDoorItem(item) && !isYellowZone(item) && rectsOverlap(draftRect(fallback), packageRect(item))) ? null : fallback;
}

function findFreeDraft(shelf, size) {
  const width = Math.min(size.width, shelf.columns);
  const depth = Math.min(size.depth, shelf.rows);
  const step = Math.max(1, Math.min(10, Math.round(Math.min(width, depth) / 4)));

  for (let row = 1; row <= shelf.rows - depth + 1; row += step) {
    for (let column = 1; column <= shelf.columns - width + 1; column += step) {
      const draft = { row, column, width, depth };
      const collision = shelf.packages.some(item => !isDoorItem(item) && !isYellowZone(item) && rectsOverlap(draftRect(draft), packageRect(item)));
      if (!collision) return draft;
    }
  }

  const fallback = { row: 1, column: 1, width, depth };
  return shelf.packages.some(item => !isDoorItem(item) && !isYellowZone(item) && rectsOverlap(draftRect(fallback), packageRect(item))) ? null : fallback;
}

function randomFreeDraft(shelf, range, size) {
  const width = Math.min(size.width, range.width);
  const depth = Math.min(size.depth, range.height || range.depth);
  const maxColumn = Math.floor(range.xEnd - width + 1);
  const maxRow = Math.floor(range.end - depth + 1);
  if (maxColumn < range.xStart || maxRow < range.start) return null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const column = range.xStart + Math.floor(Math.random() * (maxColumn - range.xStart + 1));
    const row = range.start + Math.floor(Math.random() * (maxRow - range.start + 1));
    const draft = { row, column, width, depth };
    const blocked = shelf.packages.some(item => !isDoorItem(item) && !isYellowZone(item) && rectsOverlap(draftRect(draft), packageRect(item)));
    if (!blocked) return draft;
  }
  return planPlaceRole(shelf) === 'rack'
    ? findFreeRackDraft(shelf, range, size)
    : findFreeDraft(shelf, size);
}

function fitMatches(size) {
  const matches = [];
  appState.shelves.forEach(shelf => {
    if (planPlaceRole(shelf) === 'rack') {
      rackLevelSpecs(shelf).forEach(spec => {
        const range = rackLevelRange(shelf, spec.level);
        if (size.height > (range.maxHeight || (range.short ? 16 : 65))) return;
        const draft = randomFreeDraft(shelf, range, size);
        if (draft) matches.push({ shelf, level: spec.level, levelLabel: range.label, draft });
      });
      return;
    }
    if (size.height > maxStackHeightForShelf(shelf)) return;
    const range = { xStart: 1, xEnd: shelf.columns, start: 1, end: shelf.rows, width: shelf.columns, height: shelf.rows };
    const draft = randomFreeDraft(shelf, range, size);
    if (draft) matches.push({ shelf, level: null, levelLabel: '', draft });
  });
  return matches;
}

function isBlockedItem(item) {
  return zoneKind(item) === 'red';
}

function specialKind(item) {
  const text = `${item?.package_name || ''} ${item?.note || ''}`.toLowerCase();
  if (text.includes('element:door') || text.includes('door outside') || /\bdoor\b/.test(text)) return 'door';
  if (text.includes('element:column') || text.includes('column')) return 'column';
  if (text.includes('element:corridor') || text.includes('corridor')) return 'corridor';
  const zone = zoneKind(item);
  return zone || '';
}

function zoneKind(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  if (text.includes('element:door') || text.includes('door outside') || /\bdoor\b/.test(text)) return '';
  if (text.includes('element:column') || text.includes('column') || text.includes('zone:red') || text.includes('red no-place') || text.includes('blocked') || text.includes('rot') || text.includes('verbot') || text.includes('nicht abstellen')) return 'red';
  if (text.includes('element:corridor') || text.includes('corridor') || text.includes('zone:yellow') || text.includes('yellow reserve') || text.includes('gelb') || text.includes('reserve')) return 'yellow';
  return '';
}

function isDoorItem(item) {
  return specialKind(item) === 'door';
}

function isZoneItem(item) {
  return Boolean(zoneKind(item));
}

function isYellowZone(item) {
  return zoneKind(item) === 'yellow';
}

function nearestDoorSide(item, shelf) {
  const left = (item.column_index || 1) - 1;
  const right = Math.max(0, (shelf.columns || 1) - ((item.column_index || 1) + (item.width_units || 1) - 1));
  const top = (item.row_index || 1) - 1;
  const bottom = Math.max(0, (shelf.rows || 1) - ((item.row_index || 1) + (item.depth_units || 1) - 1));
  return [['left', left], ['right', right], ['top', top], ['bottom', bottom]].sort((a, b) => a[1] - b[1])[0][0];
}

function doorSideFromNote(note) {
  return String(note || '').match(/door-side\s*:\s*(top|right|bottom|left)/i)?.[1]?.toLowerCase() || '';
}

function doorIsFlipped(item) {
  return /door-flipped\s*:\s*(?:1|true|yes)/i.test(String(item?.note || ''));
}

function noteWithDoorState(note, side, flipped) {
  const clean = String(note || '')
    .replace(/(?:,\s*)?door-side\s*:\s*(?:top|right|bottom|left)/gi, '')
    .replace(/(?:,\s*)?door-flipped\s*:\s*(?:0|1|true|false|yes|no)/gi, '')
    .replace(/^,\s*|\s*,$/g, '')
    .trim();
  const state = `door-side:${side}, door-flipped:${flipped ? 1 : 0}`;
  return clean ? `${clean}, ${state}` : state;
}

function cleanDoorStateFromNote(note) {
  return String(note || '')
    .replace(/(?:,\s*)?door-side\s*:\s*(?:top|right|bottom|left)/gi, '')
    .replace(/(?:,\s*)?door-flipped\s*:\s*(?:0|1|true|false|yes|no)/gi, '')
    .replace(/^,\s*|\s*,$/g, '')
    .trim();
}

function currentDoorNote() {
  return noteWithDoorState(els.note.value, els.doorSideValue.value || 'left', els.doorFlippedValue.value === '1');
}

function doorSide(item, shelf) {
  return doorSideFromNote(item?.note) || nearestDoorSide(item, shelf);
}

function orientDoorDraft(draft, shelf, side) {
  const vertical = side === 'left' || side === 'right';
  const shouldSwap = vertical ? draft.width > draft.depth : draft.depth > draft.width;
  if (!shouldSwap) return draftAtCell(draft, shelf, draft);
  const centerColumn = draft.column + ((draft.width - 1) / 2);
  const centerRow = draft.row + ((draft.depth - 1) / 2);
  const width = draft.depth;
  const depth = draft.width;
  return draftAtCell({
    column: Math.round(centerColumn - ((width - 1) / 2)),
    row: Math.round(centerRow - ((depth - 1) / 2))
  }, shelf, { width, depth });
}

function placeDoorOutside(rectangle, item, shelf) {
  if (!isDoorItem(item)) return;
  const side = doorSide(item, shelf);
  if (side === 'top') rectangle.style.top = '0%';
  if (side === 'bottom') rectangle.style.top = '100%';
  if (side === 'left') rectangle.style.left = '0%';
  if (side === 'right') rectangle.style.left = '100%';
}

function draftSpecialKind() {
  return specialKind({ package_name: els.packageName.value, note: els.note.value });
}

function draftAsItem(draft, kind = draftSpecialKind()) {
  return {
    row_index: draft.row,
    column_index: draft.column,
    width_units: draft.width,
    depth_units: draft.depth,
    package_name: kind === 'door' ? 'Door' : kind,
    note: kind === 'door' ? currentDoorNote() : (els.note.value || (kind ? `element:${kind}` : ''))
  };
}

function decorateDraftMarker(marker, draft, shelf) {
  const kind = draftSpecialKind();
  marker.classList.toggle('column-visual', kind === 'column');
  marker.classList.toggle('corridor-visual', kind === 'corridor');
  marker.classList.toggle('door-visual', kind === 'door');
  marker.classList.toggle('door-flipped', kind === 'door' && els.doorFlippedValue.value === '1');
  if (kind === 'door') placeDoorOutside(marker, draftAsItem(draft, kind), shelf);
}

function usableRegions(shelf) {
  if (shelf.isRackLevelSlice || planPlaceRole(shelf) !== 'rack') {
    return [{ column: 1, row: 1, width: shelf.columns || 1, depth: shelf.rows || 1, maxHeight: shelf.sliceMaxHeight || maxStackHeightForShelf(shelf) }];
  }
  return rackLevelSpecs(shelf).map(spec => ({
    column: spec.xStart,
    row: spec.start,
    width: Math.max(1, spec.xEnd - spec.xStart + 1),
    depth: Math.max(1, spec.end - spec.start + 1),
    maxHeight: spec.maxHeight || (spec.short ? 16 : 65)
  }));
}

function totalCapacityCm3(shelf, bounds = null) {
  return usableRegions(shelf).reduce((sum, region) => {
    const visible = bounds ? rectIntersection(region, bounds) : region;
    return sum + (visible ? rectArea(visible) * region.maxHeight : 0);
  }, 0);
}

function totalUsableAreaCm2(shelf, bounds = null) {
  return usableRegions(shelf).reduce((sum, region) => {
    const visible = bounds ? rectIntersection(region, bounds) : region;
    return sum + (visible ? rectArea(visible) : 0);
  }, 0);
}

function pointInsideRect(x, y, rect) {
  return x >= rect.column && x < rect.column + rect.width && y >= rect.row && y < rect.row + rect.depth;
}

function freeVolumeInBoundsCm3(shelf, bounds = null) {
  const packages = (shelf.packages || []).filter(item => !isDoorItem(item));
  return usableRegions(shelf).reduce((total, region) => {
    const visibleRegion = bounds ? rectIntersection(region, bounds) : region;
    if (!visibleRegion) return total;
    const relevant = packages
      .map(item => ({ item, rect: rectIntersection(visibleRegion, packageRect(item)) }))
      .filter(entry => entry.rect);
    const xEdges = [...new Set([
      visibleRegion.column,
      visibleRegion.column + visibleRegion.width,
      ...relevant.flatMap(entry => [entry.rect.column, entry.rect.column + entry.rect.width])
    ])].sort((a, b) => a - b);
    const yEdges = [...new Set([
      visibleRegion.row,
      visibleRegion.row + visibleRegion.depth,
      ...relevant.flatMap(entry => [entry.rect.row, entry.rect.row + entry.rect.depth])
    ])].sort((a, b) => a - b);
    let regionFree = 0;
    for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < yEdges.length - 1; yIndex += 1) {
        const left = xEdges[xIndex];
        const right = xEdges[xIndex + 1];
        const top = yEdges[yIndex];
        const bottom = yEdges[yIndex + 1];
        const midpointX = (left + right) / 2;
        const midpointY = (top + bottom) / 2;
        const covering = relevant.filter(entry => pointInsideRect(midpointX, midpointY, entry.rect));
        const occupiedHeight = covering.reduce((sum, entry) => (
          sum + (isZoneItem(entry.item)
            ? Math.min(region.maxHeight, itemHeightCm(entry.item, region.maxHeight))
            : stackTotalHeightCm(entry.item))
        ), 0);
        const remainingHeight = Math.max(0, region.maxHeight - occupiedHeight);
        regionFree += (right - left) * (bottom - top) * remainingHeight;
      }
    }
    return total + regionFree;
  }, 0);
}

function freeAreaInBoundsCm2(shelf, bounds = null) {
  const packages = (shelf.packages || []).filter(item => !isDoorItem(item));
  return usableRegions(shelf).reduce((total, region) => {
    const visibleRegion = bounds ? rectIntersection(region, bounds) : region;
    if (!visibleRegion) return total;
    const relevant = packages
      .map(item => rectIntersection(visibleRegion, packageRect(item)))
      .filter(Boolean);
    if (!relevant.length) return total + rectArea(visibleRegion);
    const xEdges = [...new Set([
      visibleRegion.column,
      visibleRegion.column + visibleRegion.width,
      ...relevant.flatMap(rect => [rect.column, rect.column + rect.width])
    ])].sort((a, b) => a - b);
    const yEdges = [...new Set([
      visibleRegion.row,
      visibleRegion.row + visibleRegion.depth,
      ...relevant.flatMap(rect => [rect.row, rect.row + rect.depth])
    ])].sort((a, b) => a - b);
    let regionFree = 0;
    for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < yEdges.length - 1; yIndex += 1) {
        const left = xEdges[xIndex];
        const right = xEdges[xIndex + 1];
        const top = yEdges[yIndex];
        const bottom = yEdges[yIndex + 1];
        const midpointX = (left + right) / 2;
        const midpointY = (top + bottom) / 2;
        if (!relevant.some(rect => pointInsideRect(midpointX, midpointY, rect))) {
          regionFree += (right - left) * (bottom - top);
        }
      }
    }
    return total + regionFree;
  }, 0);
}

function freeVolumeCm3(shelf) {
  if (shelfVolumeCache.has(shelf)) return shelfVolumeCache.get(shelf);
  const volume = freeVolumeInBoundsCm3(shelf);
  shelfVolumeCache.set(shelf, volume);
  return volume;
}

function freeAreaCm2(shelf) {
  return freeAreaInBoundsCm2(shelf);
}

function shelfFreeAreaPercent(shelf) {
  const area = totalUsableAreaCm2(shelf);
  return area ? (freeAreaCm2(shelf) / area) * 100 : 0;
}

function isStackedItem(item) {
  return stackCount(item) > 1 || String(item.note || '').toLowerCase().includes('gestap');
}

function normalizeDecimalInput(input) {
  input.value = input.value.replace(/\s/g, '');
}

function hasCompleteDecimalValue(input) {
  const value = input.value.trim();
  return value !== '' && value !== '0' && value !== '.' && value !== ',' && !/[.,]$/.test(value);
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

function stackOverlapHeight(shelf, candidate, excludeId = '') {
  if (!shelf) return 0;
  const rect = draftRect(candidate);
  return shelf.packages
    .filter(item => String(item.id) !== String(excludeId || '') && !isZoneItem(item) && !isDoorItem(item) && rectsOverlap(rect, packageRect(item)))
    .reduce((sum, item) => sum + stackTotalHeightCm(item), 0);
}

function overlappingNormalItems(shelf, candidate, excludeId = '') {
  if (!shelf) return [];
  const rect = draftRect(candidate);
  return shelf.packages.filter(item => (
    String(item.id) !== String(excludeId || '') &&
    !isZoneItem(item) && !isDoorItem(item) &&
    rectsOverlap(rect, packageRect(item))
  ));
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
  if (draftSpecialKind() === 'door' && !els.doorSideValue.value) {
    els.doorSideValue.value = nearestDoorSide(draftAsItem(draft, 'door'), savingShelf);
  }
  const oriented = draftSpecialKind() === 'door'
    ? orientDoorDraft(draft, savingShelf, els.doorSideValue.value)
    : draft;
  const adjusted = draftAtCell(
    { row: oriented.row, column: oriented.column },
    savingShelf,
    { width: oriented.width, depth: oriented.depth }
  );
  els.rowIndex.value = adjusted.row;
  els.columnIndex.value = adjusted.column;
  els.widthUnits.value = inputCm(adjusted.width);
  els.depthUnits.value = inputCm(adjusted.depth);
  appState.selected = { shelf, row: adjusted.row, column: adjusted.column };
  els.selectedCell.textContent = `${displayAreaName(shelf.name)}: ${formatSizeCm(adjusted.width, adjusted.depth)} selected`;
  return adjusted;
}

function setPackageEditFormValues(shelf, draft) {
  const savingShelf = shelfForSaving(shelf);
  const oriented = draftSpecialKind() === 'door' && els.doorSideValue.value
    ? orientDoorDraft(draft, savingShelf, els.doorSideValue.value)
    : draft;
  const adjusted = draftAtCell(
    { row: oriented.row, column: oriented.column },
    savingShelf,
    { width: oriented.width, depth: oriented.depth }
  );
  els.rowIndex.value = adjusted.row;
  els.columnIndex.value = adjusted.column;
  els.widthUnits.value = inputCm(adjusted.width);
  els.depthUnits.value = inputCm(adjusted.depth);
  appState.selected = { shelf, row: adjusted.row, column: adjusted.column };
  els.selectedCell.textContent = `${displayAreaName(shelf.name)}: change ready`;
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
  const currentSpecial = specialKind({ package_name: els.packageName.value, note: els.note.value });
  if (currentSpecial && currentSpecial !== 'door') {
    els.heightUnits.value = inputCm(maxStackHeightForShelf(shelf, draft));
  }
  if (!els.packageName.value.trim()) {
    els.packageName.value = 'Item';
  }
  els.formTitle.textContent = 'Add item';
  els.saveButton.textContent = 'Save item';
  els.deletePackageButton.classList.add('hidden');
  els.cancelEditButton.classList.remove('hidden');
  syncDraftActionButtons();
  showMessage(`${displayAreaName(shelf.name)}: space selected. Save when ready.`);
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
  els.widthUnits.value = item ? inputCm(item.width_units || 120) : '1,200';
  els.depthUnits.value = item ? inputCm(item.depth_units || 80) : '800';
  els.heightUnits.value = item ? inputCm(itemHeightCm(item)) : '450';
  els.packageName.value = item ? displayPackageName(item) : '';
  els.quantity.value = item ? item.quantity : 1;
  els.note.value = item ? cleanDoorStateFromNote(cleanHeightFromNote(item.note || '')) : '';
  els.doorSideValue.value = item && isDoorItem(item) ? (doorSideFromNote(item.note) || nearestDoorSide(item, shelf)) : '';
  els.doorFlippedValue.value = item && isDoorItem(item) && doorIsFlipped(item) ? '1' : '0';
  if (item && isDoorItem(item)) {
    const oriented = orientDoorDraft({
      row,
      column,
      width: item.width_units || 1,
      depth: item.depth_units || 1
    }, shelfForSaving(shelf), els.doorSideValue.value);
    els.rowIndex.value = oriented.row;
    els.columnIndex.value = oriented.column;
    els.widthUnits.value = inputCm(oriented.width);
    els.depthUnits.value = inputCm(oriented.depth);
  }
  els.formTitle.textContent = item ? 'Edit item' : 'Add item';
  els.saveButton.textContent = item ? 'Save changes' : 'Save item';
  els.deletePackageButton.classList.toggle('hidden', !item);
  els.cancelEditButton.classList.remove('hidden');
  els.selectedCell.textContent = item
    ? `${displayAreaName(shelf.name)}: editing active`
    : `${displayAreaName(shelf.name)}: space selected`;
  if (!item) els.packageName.focus();
  render();
}

function clearPackageForm() {
  appState.selected = null;
  els.packageId.value = '';
  els.doorSideValue.value = '';
  els.doorFlippedValue.value = '0';
  els.packageName.value = '';
  els.quantity.value = 1;
  els.note.value = '';
  els.widthUnits.value = '1,200';
  els.depthUnits.value = '800';
  els.heightUnits.value = '450';
  els.formTitle.textContent = 'Add item';
  els.saveButton.textContent = 'Save item';
  els.deletePackageButton.classList.add('hidden');
  els.doorSideControls.classList.add('hidden');
  els.cancelEditButton.classList.add('hidden');
}

function syncDraftActionButtons() {
  const hasDraft = Boolean(appState.selected);
  const isDoor = hasDraft && draftSpecialKind() === 'door';
  els.cancelEditButton.classList.toggle('hidden', !hasDraft);
  els.doorSideControls.classList.toggle('hidden', !isDoor);
  els.doorSideControls.querySelectorAll('[data-door-side]').forEach(button => {
    button.classList.toggle('active', button.dataset.doorSide === els.doorSideValue.value);
  });
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
  els.placeParentId.value = '';
  els.placeLocationType.value = 'shelf';
  els.placeName.value = '';
  els.placeRows.value = inputCm(planPlaces.rack.rows);
  els.placeColumns.value = inputCm(600);
  els.placeHeight.value = inputCm(65);
  els.placeNotes.value = '';
  els.rackModeValue.value = 'custom';
  els.rackLayoutValue.value = '[]';
  renderRackStructureEditor([]);
  syncRackStructureControls();
  els.savePlaceButton.textContent = 'Create area';
  els.cancelPlaceButton.classList.add('hidden');
}

function startAreaCreation(kind) {
  clearPlaceForm();
  const isFloor = kind === 'floor';
  const baseName = isFloor ? 'Floor area' : 'Rack';
  let nextNumber = appState.shelves.filter(place => placeKind(place) === kind && !parentRackId(place)).length + 1;
  while (appState.shelves.some(place => String(place.name || '').trim().toLowerCase() === `${baseName} ${nextNumber}`.toLowerCase())) {
    nextNumber += 1;
  }
  els.placeLocationType.value = isFloor ? 'floor' : 'shelf';
  els.placeName.value = `${baseName} ${nextNumber}`;
  els.placeRows.value = inputCm(isFloor ? 400 : 90);
  els.placeColumns.value = inputCm(600);
  els.placeHeight.value = inputCm(isFloor ? 220 : 65);
  els.rackModeValue.value = isFloor ? '' : 'custom';
  syncRackStructureControls();
  els.savePlaceButton.textContent = 'Create area';
  els.cancelPlaceButton.classList.remove('hidden');
  setActiveView('places');
  els.placeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  els.placeName.focus();
  els.placeName.select();
}

function parentRackId(placeOrNotes) {
  const notes = typeof placeOrNotes === 'object' ? placeOrNotes?.notes : placeOrNotes;
  return String(notes || '').match(/parent-rack\s*:\s*([^;,\s]+)/i)?.[1] || '';
}

function visiblePlaceNotes(notes) {
  return String(notes || '')
    .replace(/(?:[;,]\s*)?parent-rack\s*:\s*([^;,\s]+)/gi, '')
    .replace(/(?:[;,]\s*)?rack-order\s*:\s*[123](?:\s*[>|-]\s*[123]){2}/gi, '')
    .replace(/(?:[;,]\s*)?rack-mode\s*:\s*custom/gi, '')
    .replace(/(?:[;,]\s*)?rack-layout\s*:\s*[^;,\s]+/gi, '')
    .replace(/(?:[;,]\s*)?rack-position\s*:\s*\d+/gi, '')
    .replace(/(?:[;,]\s*)?max-height-mm\s*:\s*[0-9.,]+/gi, '')
    .replace(/(?:[;,]\s*)?max(?:imum)?\s*height\s*[0-9.,]+\s*(?:mm|cm)/gi, '')
    .replace(/^[\s;,]+|[\s;,]+$/g, '')
    .trim();
}

function isCustomRack(placeOrNotes) {
  const notes = typeof placeOrNotes === 'object' ? placeOrNotes?.notes : placeOrNotes;
  return /rack-mode\s*:\s*custom/i.test(String(notes || ''));
}

function noteWithMarker(note, pattern, marker) {
  const clean = String(note || '').replace(pattern, '').replace(/^[\s;,]+|[\s;,]+$/g, '').trim();
  return clean ? `${clean}; ${marker}` : marker;
}

function rackOrderFromNotes(notes) {
  const marker = String(notes || '').match(/rack-order\s*:\s*([123])\s*[>|-]\s*([123])\s*[>|-]\s*([123])/i);
  const order = marker ? marker.slice(1, 4).map(Number) : [1, 2, 3];
  return new Set(order).size === 3 ? order : [1, 2, 3];
}

function normalizeRackLayout(levels) {
  if (!Array.isArray(levels)) return [];
  const normalized = levels.map((level, index) => ({
    id: String(level.id || `level-${index + 1}`),
    slot: Math.max(1, Number.parseInt(level.slot, 10) || index + 1),
    start: Math.max(0, numberValue(level.start, 0)),
    name: String(level.name || `Sub-rack ${index + 1}`).trim() || `Sub-rack ${index + 1}`,
    width: Math.max(0.1, numberValue(level.width, 600)),
    depth: Math.max(0.1, numberValue(level.depth, 90)),
    height: Math.max(0.1, numberValue(level.height, 65))
  }));
  let nextStart = 1;
  [...normalized].sort((a, b) => a.slot - b.slot).forEach(level => {
    if (level.start < 1) level.start = nextStart;
    nextStart = Math.max(nextStart, level.start + level.depth);
  });
  return normalized;
}

function rackLayoutFromNotes(placeOrNotes) {
  const notes = typeof placeOrNotes === 'object' ? placeOrNotes?.notes : placeOrNotes;
  const encoded = String(notes || '').match(/rack-layout\s*:\s*([^;,\s]+)/i)?.[1];
  if (!encoded) return [];
  try {
    return normalizeRackLayout(JSON.parse(decodeURIComponent(encoded)));
  } catch (error) {
    return [];
  }
}

function rackLayoutMarker(levels) {
  return `rack-layout:${encodeURIComponent(JSON.stringify(normalizeRackLayout(levels)))}`;
}

function rackLayoutFromEditor() {
  return normalizeRackLayout([...els.rackStructureList.querySelectorAll('[data-rack-level-row]')].map(row => ({
    id: row.dataset.levelId,
    slot: row.dataset.levelSlot,
    start: row.dataset.levelStart,
    name: row.querySelector('[data-level-name]').value,
    width: cmInputToCm(row.querySelector('[data-level-width]').value, 600),
    depth: cmInputToCm(row.querySelector('[data-level-depth]').value, 90),
    height: cmInputToCm(row.querySelector('[data-level-height]').value, 65)
  })));
}

function syncRackLayoutValue() {
  els.rackLayoutValue.value = JSON.stringify(rackLayoutFromEditor());
}

function renderRackStructureEditor(levels = []) {
  const layout = normalizeRackLayout(levels);
  els.rackLayoutValue.value = JSON.stringify(layout);
  els.rackStructureList.innerHTML = '';
  layout.forEach((level, index) => {
    const row = document.createElement('div');
    row.className = 'rack-structure-row';
    row.dataset.rackLevelRow = '1';
    row.dataset.levelId = level.id;
    row.dataset.levelSlot = level.slot;
    row.dataset.levelStart = level.start;
    row.innerHTML = `
      <span class="rack-structure-position">${index === 0 ? 'Bottom' : index === layout.length - 1 ? 'Top' : `Position ${index + 1}`}</span>
      <input data-level-name aria-label="Sub-rack name" value="${escapeHtml(level.name)}">
      <label>Width (mm)<input data-level-width inputmode="decimal" value="${inputCm(level.width)}"></label>
      <label>Depth (mm)<input data-level-depth inputmode="decimal" value="${inputCm(level.depth)}"></label>
      <label>Height (mm)<input data-level-height inputmode="decimal" value="${inputCm(level.height)}"></label>
      <span class="rack-structure-actions">
        <button class="ghost" type="button" data-level-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button class="ghost" type="button" data-level-move="1" ${index === layout.length - 1 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="danger" type="button" data-level-remove aria-label="Remove sub-rack">×</button>
      </span>
    `;
    row.querySelectorAll('input').forEach(input => input.addEventListener('input', syncRackLayoutValue));
    row.querySelector('[data-level-remove]').addEventListener('click', () => {
      layout.splice(index, 1);
      renderRackStructureEditor(layout);
    });
    row.querySelectorAll('[data-level-move]').forEach(button => button.addEventListener('click', () => {
      const target = index + Number(button.dataset.levelMove);
      if (target < 0 || target >= layout.length) return;
      [layout[index], layout[target]] = [layout[target], layout[index]];
      renderRackStructureEditor(layout);
    }));
    els.rackStructureList.append(row);
  });
}

function addRackLevelDefinition() {
  const layout = rackLayoutFromEditor();
  const nextSlot = Math.max(0, ...layout.map(level => level.slot)) + 1;
  const nextStart = Math.max(1, ...layout.map(level => level.start + level.depth));
  layout.push({
    id: `level-${Date.now()}-${nextSlot}`,
    slot: nextSlot,
    start: nextStart,
    name: `Sub-rack ${layout.length + 1}`,
    width: 600,
    depth: 90,
    height: 65
  });
  renderRackStructureEditor(layout);
  els.rackStructureList.lastElementChild?.querySelector('[data-level-name]')?.select();
}

function syncRackStructureControls() {
  const isRack = els.placeLocationType.value === 'shelf';
  const isCustomParent = isRack && !els.placeParentId.value && els.rackModeValue.value === 'custom';
  els.rackStructureControls?.classList.toggle('hidden', !isCustomParent);
  els.placeDepthControl?.classList.toggle('hidden', isCustomParent);
  els.placeWidthControl?.classList.toggle('hidden', isCustomParent);
  els.placeHeightControl?.classList.toggle('hidden', isCustomParent);
}

function areaHeightLabel(shelf) {
  if (placeKind(shelf) === 'floor') return `max height ${formatNumber(areaMaxHeightCm(shelf, 220) * 10)} mm`;
  if (parentRackId(shelf)) return `max height ${formatNumber(areaMaxHeightCm(shelf, 65) * 10)} mm`;
  if (isCustomRack(shelf)) {
    const levels = rackLayoutFromNotes(shelf);
    return levels.length
      ? `${formatNumber(levels.reduce((sum, level) => sum + level.height, 0) * 10)} mm total`
      : 'defined by sub-racks';
  }
  return planPlaceRole(shelf) === 'rack' ? 'levels 650 mm · small 160 mm' : 'max height 650 mm';
}

async function deletePackage(id) {
  await apiFetch(`/api/regale?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('Item deleted.');
  await loadShelves();
}

function render() {
  setAuthUi();
  syncDraftActionButtons();
  els.shelves.innerHTML = '';
  els.placeList.innerHTML = '';

  if (!appState.token) {
    els.summaryText.textContent = 'Please sign in.';
    return;
  }

  const floorPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'floor');
  const shelfPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'shelf');
  const visibleShelves = appState.shelves;
  const selectedShelf = visibleShelves.find(shelf => String(shelf.id) === String(appState.activeAreaId))
    || findPlanShelf(appState.activePlanRole, visibleShelves)
    || visibleShelves[0];
  els.summaryText.textContent = visibleShelves.length
    ? 'Free area, capacity, and volume are shown for the selected area below.'
    : 'No areas have been created yet.';
  renderModel3d(selectedShelf ? [selectedShelf] : []);
  renderPlanDrawing(shelfPlaces, floorPlaces);
  renderPlaces();
  renderFitFinder();
}

function renderFitFinder() {
  if (!els.fitFinderForm || !els.fitResults) return;
  els.fitFinderForm.classList.toggle('hidden', !appState.fitFinder.open);
  els.toggleFitFinderButton.textContent = appState.fitFinder.open ? 'Close size search' : 'Enter element size';
  els.fitResults.classList.toggle('hidden', !appState.fitFinder.searched);
  els.fitResults.innerHTML = '';
  if (!appState.fitFinder.searched) return;
  if (!appState.fitFinder.matches.length) {
    els.fitResults.innerHTML = '<p class="fit-empty">No current area has a completely free position for this size.</p>';
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'fit-result-intro';
  intro.textContent = `${appState.fitFinder.matches.length} matching position(s). Click one to open the area with an unsaved random placement.`;
  els.fitResults.append(intro);
  appState.fitFinder.matches.forEach(match => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fit-result';
    button.innerHTML = `
      <span>${escapeHtml(displayAreaName(match.shelf.label || match.shelf.name))}${match.levelLabel ? ` · ${escapeHtml(match.levelLabel)}` : ''}</span>
      <strong>${formatSizeCm(match.draft.width, match.draft.depth)} · max h ${formatNumber(maxStackHeightForShelf(match.shelf, match.draft) * 10)} mm</strong>
      <small>Open with random unsaved placement →</small>
    `;
    button.addEventListener('click', () => openFitMatch(match));
    els.fitResults.append(button);
  });
}

function openFitMatch(match) {
  const width = cmInputToCm(els.fitWidth.value, 120);
  const depth = cmInputToCm(els.fitDepth.value, 80);
  const height = cmInputToCm(els.fitHeight.value, 45);
  const range = match.level
    ? rackLevelRange(match.shelf, match.level)
    : { xStart: 1, xEnd: match.shelf.columns, start: 1, end: match.shelf.rows, width: match.shelf.columns, height: match.shelf.rows };
  const draft = randomFreeDraft(match.shelf, range, { width, depth, height }) || match.draft;
  clearPackageForm();
  els.widthUnits.value = inputCm(width);
  els.depthUnits.value = inputCm(depth);
  els.heightUnits.value = inputCm(height);
  els.packageName.value = 'Unsaved element';
  appState.activeAreaId = match.shelf.id;
  appState.activePlanRole = planPlaceRole(match.shelf) || 'other';
  if (match.level) appState.activeRackLevel = match.level;
  applyDraftSelection(match.shelf, draft);
  render();
  window.requestAnimationFrame(() => document.querySelector('.plan-slot')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function isNearSize(shelf, role) {
  const expected = expectedPlanSize(role);
  return Math.abs((shelf.columns || 0) - expected.columns) <= 2 && Math.abs((shelf.rows || 0) - expected.rows) <= 2;
}

function planPlaceRole(shelf) {
  const text = `${shelf.name || ''} ${shelf.label || ''} ${shelf.notes || ''}`.toLowerCase();
  if (placeKind(shelf) === 'shelf') {
    if (parentRackId(shelf)) return null;
    return isCustomRack(shelf) || isNearSize(shelf, 'rack') || text.includes('4 rack') || text.includes('4 regale') || text.includes('4 plätze') || text.includes('600 x 450') || text.includes('600 x 360') || text.includes('600 x 90') || text.includes('600 x 106')
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
    rows: internalCmToMeters(place.rows, place.rows),
    columns: internalCmToMeters(place.columns, place.columns),
    notes: place.notes
  };
}

function placeNeedsPlanUpdate(place, role) {
  // Racks are user-defined structures. Never replace an existing rack with a preset layout.
  if (role === 'rack') return false;
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
  if (all.length) {
    const selected = all.find(place => String(place.id) === String(appState.activeAreaId))
      || findPlanShelf(appState.activePlanRole, all)
      || all[0];
    appState.activeAreaId = selected.id;
    const role = planPlaceRole(selected) || 'other';
    appState.activePlanRole = role;
    plan.append(renderAreaSwitcher(all, selected));
    plan.append(renderPlanSlot(role, selected));
  } else {
    plan.append(renderPlanSwitcher());
    plan.append(renderPlanSlot(appState.activePlanRole, null));
  }
  els.shelves.append(plan);
}

function renderAreaSwitcher(places, selected) {
  const nav = document.createElement('div');
  nav.className = 'plan-switcher area-switcher';
  nav.setAttribute('aria-label', 'All storage areas');
  orderAreasWithChildren(places).forEach(place => {
    const parentId = parentRackId(place);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `plan-switch ${parentId ? 'sub-rack-switch' : ''} ${String(place.id) === String(selected.id) ? 'active' : ''}`;
    button.innerHTML = `
      <span>${parentId ? '↳ ' : ''}${escapeHtml(displayAreaName(place.label || place.name))}</span>
      <small>${parentId ? 'Sub-rack' : escapeHtml(placeLabel(placeKind(place)))}</small>
    `;
    button.addEventListener('click', () => {
      appState.activeAreaId = place.id;
      appState.activePlanRole = planPlaceRole(place) || 'other';
      clearPackageForm();
      els.selectedCell.textContent = 'No area selected';
      render();
    });
    nav.append(button);
  });
  nav.append(renderAddAreaControl());
  return nav;
}

function renderAddAreaControl() {
  const control = document.createElement('details');
  control.className = 'add-area-control';
  control.innerHTML = `
    <summary>+ Add area</summary>
    <div class="add-area-options">
      <button type="button" data-new-area="shelf"><strong>New rack</strong><small>Storage with rack levels</small></button>
      <button type="button" data-new-area="floor"><strong>New floor area</strong><small>Open storage floor</small></button>
    </div>
  `;
  control.querySelectorAll('[data-new-area]').forEach(button => {
    button.addEventListener('click', () => startAreaCreation(button.dataset.newArea));
  });
  return control;
}

function orderAreasWithChildren(places) {
  const children = new Map();
  places.forEach(place => {
    const parentId = parentRackId(place);
    if (!parentId) return;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(place);
  });
  const ordered = [];
  const visited = new Set();
  const append = place => {
    if (visited.has(String(place.id))) return;
    visited.add(String(place.id));
    ordered.push(place);
    (children.get(String(place.id)) || []).forEach(append);
  };
  places.filter(place => !parentRackId(place)).forEach(append);
  places.forEach(append);
  return ordered;
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
  nav.append(renderAddAreaControl());
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
  const customRack = Boolean(shelf && isCustomRack(displayShelf));
  const customLevels = customRack ? rackLayoutFromNotes(displayShelf) : [];
  const shownFreeArea = freeAreaCm2(displayShelf);
  const shownFreeVolume = freeVolumeCm3(displayShelf);
  const shownFreePercent = shelfFreePercent(displayShelf);
  const shownAreaSize = customLevels.length
    ? formatSizeCm(Math.max(...customLevels.map(level => level.width)), Math.max(...customLevels.map(level => level.depth)))
    : formatSizeCm(displayShelf.columns, displayShelf.rows);
  const shownHeight = customRack
    ? (customLevels.length
      ? `${formatNumber(customLevels.reduce((sum, level) => sum + level.height, 0) * 10)} mm total`
      : 'defined by sub-racks')
    : areaHeightLabel(displayShelf);

  const meta = document.createElement('div');
  meta.className = 'shelf-meta plan-meta';
  meta.innerHTML = `
    <div>
      <span class="place-type">${placeLabel(kind)}</span>
      <h2>${escapeHtml(displayAreaName(displayShelf.label || displayShelf.name))}</h2>
    </div>
    <div class="stats">
      <span class="stat"><small>Area size</small>${shownAreaSize}</span>
      <span class="stat"><small>Free area</small>${shelf ? formatAreaMm2(shownFreeArea) : 'not created yet'}</span>
      <span class="stat selected-volume"><small>Free volume</small>${shelf ? formatVolumeMm3(shownFreeVolume) : 'not created yet'}</span>
      ${shelf ? `<span class="stat"><small>Free capacity</small>${formatNumber(shownFreePercent, 1)}%</span>` : ''}
      <span class="stat"><small>Height</small>${escapeHtml(shownHeight)}</span>
      ${shelf ? `
        <span class="plan-meta-actions">
          <button class="ghost edit-area" type="button">Edit</button>
          <button class="danger delete-area" type="button">Delete</button>
        </span>
      ` : ''}
    </div>
  `;
  if (shelf) {
    meta.querySelector('.edit-area').addEventListener('click', () => {
      selectPlace(shelf);
      setActiveView('places');
      els.placeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    meta.querySelector('.delete-area').addEventListener('click', () => {
      const itemCount = shelf.packages?.length || 0;
      const detail = itemCount ? ` It contains ${itemCount} item(s).` : '';
      if (!window.confirm(`Really delete "${displayAreaName(shelf.label || shelf.name)}"?${detail}`)) return;
      deletePlace(shelf.id).catch(error => showMessage(error.message, 'error'));
    });
  }
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
    if (role === 'rack') {
      startAreaCreation('shelf');
      return;
    }
    createPlanPlace(role).catch(error => showMessage(error.message, 'error'));
  });
  return placeholder;
}

function renderRackDisplay(shelf) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rack-display';

  const levels = document.createElement('div');
  levels.className = 'rack-levels';
  const specs = rackLevelSpecs(shelf);
  if (!specs.length) {
    levels.innerHTML = '<div class="custom-rack-empty"><strong>No sub-racks defined</strong><span>Edit this rack and add its internal sub-racks.</span></div>';
    wrapper.append(levels);
    return wrapper;
  }
  if (!specs.some(spec => String(spec.level) === String(appState.activeRackLevel))) {
    appState.activeRackLevel = specs[0].level;
  }

  specs.forEach(spec => {
    const level = spec.level;
    const button = document.createElement('button');
    const range = rackLevelRange(shelf, level);
    const packages = shelf.packages.filter(item => packageInRackLevel(item, range));
    button.type = 'button';
    button.className = `rack-level ${range.short ? 'short-level' : ''} ${String(appState.activeRackLevel) === String(level) ? 'active' : ''}`;
    button.innerHTML = `
      <span>${escapeHtml(range.label)}</span>
      <strong>${formatVolumeMm3(rackLevelFreeVolumeCm3(shelf, level))} free</strong>
      <small>${range.heightLabel || `${packages.length} positions`}</small>
      ${range.short ? '<i class="short-shelf-mark" aria-hidden="true"></i>' : ''}
    `;
    button.addEventListener('click', () => {
      appState.activeRackLevel = level;
      clearPackageForm();
      render();
    });
    levels.append(button);
  });

  wrapper.append(levels);
  wrapper.append(renderRackTools(shelf, appState.activeRackLevel));
  wrapper.append(renderRackSelectionStats(shelf, appState.activeRackLevel));
  wrapper.append(renderRackLevelDetail(shelf, appState.activeRackLevel));
  return wrapper;
}

function renderRackSelectionStats(shelf, level) {
  const range = rackLevelRange(shelf, level);
  const slice = rackLevelSlice(shelf, level);
  const stats = document.createElement('div');
  stats.className = 'rack-selection-stats';
  stats.innerHTML = `
    <strong>${escapeHtml(range.label)}</strong>
    <span><small>Free area</small>${formatAreaMm2(freeAreaCm2(slice))}</span>
    <span><small>Area free</small>${formatNumber(shelfFreeAreaPercent(slice), 1)}%</span>
    <span><small>Free volume</small>${formatVolumeMm3(freeVolumeCm3(slice))}</span>
  `;
  return stats;
}

function renderRackTools(shelf, level) {
  const tools = document.createElement('div');
  tools.className = 'rack-tools';
  const measurement = activeMeasurement(shelf, level);
  tools.append(renderMeasureButton(shelf, level, 'line', 'Measure', measurement));
  tools.append(renderMeasureButton(shelf, level, 'area', 'mm³', measurement));

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
  tools.append(renderMeasureButton(shelf, null, 'area', 'mm³', measurement));

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
  const visualShelf = rackVisualShelf(range);
  const canvas = document.createElement('div');
  const measurement = activeMeasurement(shelf, level);
  let measuringPointer = null;
  let dragStart = null;
  let dragDraft = null;
  let dragMarker = null;
  let dragOrigin = null;
  let dragMoved = false;
  canvas.className = `rack-level-detail place-canvas ${range.short ? 'short-rack-detail' : ''}`;
  canvas.classList.toggle('rack-level-portrait', rackLevelRotated(range));
  canvas.style.setProperty('--cols', 1);
  canvas.style.setProperty('--rows', 1);
  canvas.style.aspectRatio = `${visualShelf.columns} / ${Math.max(1, visualShelf.rows)}`;
  canvas.append(renderDimensionLabels({ ...shelf, columns: visualShelf.columns, rows: visualShelf.rows }, 'shelf', range.short ? 'rack-short-detail' : 'rack-detail'));
  canvas.append(renderMeasureOverlay(rackVisualMeasurement(measurement, range), { width: visualShelf.columns, height: visualShelf.rows }, measurement));

  const visiblePackages = orderedForStacking(shelf.packages.filter(item => packageInRackLevel(item, range)));
  const renderedPackages = [];
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
    if (selectedPackage) displayItem.note = isDoorItem(displayItem)
      ? currentDoorNote()
      : noteWithHeight(els.note.value, cmInputToCm(els.heightUnits.value, itemHeightCm(item)));
    const clippedTop = Math.max(displayItem.row_index, range.start);
    const clippedBottom = Math.min(displayItem.row_index + (displayItem.depth_units || 1) - 1, range.end);
    const clippedLeft = Math.max(displayItem.column_index, range.xStart);
    const clippedRight = Math.min(displayItem.column_index + (displayItem.width_units || 1) - 1, range.xEnd);
    const visibleDepth = Math.max(1, clippedBottom - clippedTop + 1);
    const visibleWidth = Math.max(1, clippedRight - clippedLeft + 1);
    const localShelf = { columns: range.width, rows: range.height };
    const localDisplayItem = {
      ...displayItem,
      row_index: clippedTop - range.start + 1,
      column_index: clippedLeft - range.xStart + 1,
      width_units: visibleWidth,
      depth_units: visibleDepth
    };
    const visualDisplayItem = rackLocalToVisual({
      column: localDisplayItem.column_index,
      row: localDisplayItem.row_index,
      width: localDisplayItem.width_units,
      depth: localDisplayItem.depth_units
    }, range);
    rectangle.className = `package-rect rack-package ${selectedPackage ? 'selected' : ''}`;
    rectangle.classList.toggle('compact-label', !rackPackageLabelFits(visualDisplayItem.width, visualDisplayItem.depth));
    rectangle.classList.toggle('blocked-zone', isBlockedItem(displayItem));
    rectangle.classList.toggle('reserve-zone', isYellowZone(displayItem));
    rectangle.classList.toggle('column-element', specialKind(displayItem) === 'column');
    rectangle.classList.toggle('corridor-element', specialKind(displayItem) === 'corridor');
    rectangle.classList.toggle('door-element', isDoorItem(displayItem));
    rectangle.classList.toggle('column-visual', specialKind(displayItem) === 'column');
    rectangle.classList.toggle('corridor-visual', specialKind(displayItem) === 'corridor');
    rectangle.classList.toggle('door-visual', isDoorItem(displayItem));
    rectangle.classList.toggle('door-flipped', isDoorItem(displayItem) && doorIsFlipped(displayItem));
    if (isDoorItem(displayItem)) {
      const physicalSide = doorSide(localDisplayItem, localShelf);
      const visualSide = rackLevelRotated(range)
        ? ({ left: 'top', right: 'bottom', top: 'left', bottom: 'right' }[physicalSide] || physicalSide)
        : physicalSide;
      rectangle.classList.add(`door-${visualSide}`);
    }
    rectangle.classList.toggle('stacked-zone', isStackedItem(displayItem));
    rectangle.classList.toggle('overlapping-item', renderedPackages.some(previous => (
      !isZoneItem(previous) && !isDoorItem(previous) && !isZoneItem(displayItem) && !isDoorItem(displayItem) && rectsOverlap(packageRect(previous), packageRect(displayItem))
    )));
    rectangle.type = 'button';
    rectangle.style.left = `${((visualDisplayItem.column - 1) / visualShelf.columns) * 100}%`;
    rectangle.style.top = `${((visualDisplayItem.row - 1) / visualShelf.rows) * 100}%`;
    rectangle.style.width = `${(visualDisplayItem.width / visualShelf.columns) * 100}%`;
    rectangle.style.height = `${(visualDisplayItem.depth / visualShelf.rows) * 100}%`;
    if (isDoorItem(displayItem)) {
      const side = [...rectangle.classList].find(name => name.startsWith('door-') && name !== 'door-element');
      if (side === 'door-top') rectangle.style.top = '0%';
      if (side === 'door-bottom') rectangle.style.top = '100%';
      if (side === 'door-left') rectangle.style.left = '0%';
      if (side === 'door-right') rectangle.style.left = '100%';
    }
    rectangle.dataset.tooltip = packageTooltip(displayItem);
    rectangle.setAttribute('aria-label', displayPackageName(item));
    rectangle.innerHTML = packageHtml(displayItem, selectedPackage);
    rectangle.addEventListener('pointerdown', event => {
      if (isMeasuring(shelf, level)) return;
      startRackPackageEdit(event, canvas, shelf, range, item, rectangle, displayItem);
    });
    rectangle.addEventListener('click', () => {
      if (rectangle.dataset.dragged === 'true') {
        rectangle.dataset.dragged = 'false';
        return;
      }
      selectOverlappingItem(shelf, item, renderedPackages);
    });
    canvas.append(rectangle);
    renderedPackages.push(displayItem);
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
    const visualDraft = rackLocalToVisual(localDraft, range);
    marker.className = 'draft-marker rack-draft-marker';
    marker.innerHTML = draftMarkerHtml(draft);
    decorateDraftMarker(marker, visualDraft, visualShelf);
    updateDragMarker(visualShelf, marker, visualDraft);
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
      const point = rackPhysicalMeasurePoint(canvasMeasurePointFromEvent(event, canvas, visualShelf), range);
      measuringPointer = event.pointerId;
      startMeasurement(shelf, level, point);
      updateMeasurement(shelf, level, point, false, canvasMeasureSize(canvas));
      canvas.setPointerCapture(event.pointerId);
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(rackVisualMeasurement(activeMeasurement(shelf, level), range), { width: visualShelf.columns, height: visualShelf.rows }, activeMeasurement(shelf, level)));
      return;
    }
    if (event.target.closest('.package-rect, .draft-marker')) return;
    event.preventDefault();
    dragStart = canvasCellFromEvent(event, canvas, visualShelf);
    dragDraft = draftFromCorners(dragStart, dragStart, visualShelf);
    dragOrigin = { x: event.clientX, y: event.clientY };
    dragMoved = false;
    dragMarker = document.createElement('div');
    dragMarker.className = 'drag-marker rack-draft-marker';
    dragMarker.innerHTML = draftMarkerHtml(dragDraft);
    decorateDraftMarker(dragMarker, dragDraft, visualShelf);
    updateDragMarker(visualShelf, dragMarker, dragDraft);
    canvas.append(dragMarker);
    canvas.setPointerCapture(event.pointerId);
  }, true);

  canvas.addEventListener('pointermove', event => {
    if (measuringPointer === event.pointerId && isMeasuring(shelf, level)) {
      event.preventDefault();
      updateMeasurement(
        shelf,
        level,
        rackPhysicalMeasurePoint(canvasMeasurePointFromEvent(event, canvas, visualShelf), range),
        false,
        canvasMeasureSize(canvas)
      );
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(rackVisualMeasurement(activeMeasurement(shelf, level), range), { width: visualShelf.columns, height: visualShelf.rows }, activeMeasurement(shelf, level)));
      return;
    }
    if (!dragDraft || !dragMarker) return;
    event.preventDefault();
    if (dragOrigin && Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y) >= 4) dragMoved = true;
    updateRackDoorSideFromPointer(event, canvas, range);
    dragDraft = draftFromCorners(dragStart, canvasCellFromEvent(event, canvas, visualShelf), visualShelf);
    decorateDraftMarker(dragMarker, dragDraft, visualShelf);
    updateDragMarker(visualShelf, dragMarker, dragDraft);
    const physicalDraft = rackVisualToLocal(dragDraft, range);
    dragMarker.querySelector('.draft-size').textContent = formatSizeCm(physicalDraft.width, physicalDraft.depth);
  });

  canvas.addEventListener('pointerup', event => {
    if (measuringPointer === event.pointerId && isMeasuring(shelf, level)) {
      event.preventDefault();
      updateMeasurement(
        shelf,
        level,
        rackPhysicalMeasurePoint(canvasMeasurePointFromEvent(event, canvas, visualShelf), range),
        true,
        canvasMeasureSize(canvas)
      );
      measuringPointer = null;
      render();
      return;
    }
    if (!dragDraft || !dragMarker) return;
    event.preventDefault();
    if (!dragMoved) {
      dragMarker.remove();
      dragStart = null;
      dragDraft = null;
      dragMarker = null;
      dragOrigin = null;
      return;
    }
    const completedDraft = rackGlobalDraft(shelf, range, rackVisualToLocal(dragDraft, range));
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    dragMarker.remove();
    dragStart = null;
    dragDraft = null;
    dragMarker = null;
    dragOrigin = null;
    dragMoved = false;
    applyDraftSelection(shelf, completedDraft);
    render();
    els.packageName.focus({ preventScroll: true });
    window.scrollTo(scrollPosition.x, scrollPosition.y);
    window.requestAnimationFrame(() => window.scrollTo(scrollPosition.x, scrollPosition.y));
  });

  canvas.addEventListener('pointercancel', () => {
    measuringPointer = null;
    dragMarker?.remove();
    dragStart = null;
    dragDraft = null;
    dragMarker = null;
    dragOrigin = null;
    dragMoved = false;
  });

  return canvas;
}

function renderMeasureOverlay(measurement, range, summaryMeasurement = measurement) {
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
    label.textContent = measureSummary(summaryMeasurement);
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
  const viewRange = { width: shelf.columns, height: shelf.rows, rotated: kind === 'floor' && shelf.columns > shelf.rows };
  const visualShelf = rackVisualShelf(viewRange);
  const canvas = document.createElement('div');
  let dragStart = null;
  let dragDraft = null;
  let dragMarker = null;
  let measuringPointer = null;
  const measurement = activeMeasurement(shelf);
  canvas.className = `place-canvas ${kind === 'floor' ? 'floor-canvas' : ''}`;
  canvas.classList.toggle('floor-area-portrait', rackLevelRotated(viewRange));
  canvas.style.setProperty('--cols', Math.max(1, Math.round(visualShelf.columns / (kind === 'shelf' ? 150 : 100))));
  canvas.style.setProperty('--rows', Math.max(1, Math.ceil(visualShelf.rows / 100)));
  canvas.style.aspectRatio = `${visualShelf.columns} / ${Math.max(1, visualShelf.rows)}`;
  canvas.append(renderDimensionLabels({ ...shelf, columns: visualShelf.columns, rows: visualShelf.rows }, kind, role));
  canvas.append(renderMeasureOverlay(rackVisualMeasurement(measurement, viewRange), { width: visualShelf.columns, height: visualShelf.rows }, measurement));
  canvas.addEventListener('pointerdown', event => {
    if (isMeasuring(shelf)) {
      event.preventDefault();
      event.stopPropagation();
      measuringPointer = event.pointerId;
      const point = rackPhysicalMeasurePoint(canvasMeasurePointFromEvent(event, canvas, visualShelf), viewRange);
      startMeasurement(shelf, null, point);
      updateMeasurement(shelf, null, point, false, canvasMeasureSize(canvas));
      canvas.setPointerCapture(event.pointerId);
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(rackVisualMeasurement(activeMeasurement(shelf), viewRange), { width: visualShelf.columns, height: visualShelf.rows }, activeMeasurement(shelf)));
      return;
    }
    if (event.target !== canvas) return;
    event.preventDefault();
    dragStart = canvasCellFromEvent(event, canvas, visualShelf);
    dragDraft = draftFromCorners(dragStart, dragStart, visualShelf);
    dragMarker = document.createElement('div');
    dragMarker.className = 'drag-marker';
    decorateDraftMarker(dragMarker, dragDraft, visualShelf);
    canvas.append(dragMarker);
    canvas.setPointerCapture(event.pointerId);
    updateDragMarker(visualShelf, dragMarker, dragDraft);
  }, true);

  canvas.addEventListener('pointermove', event => {
    if (measuringPointer === event.pointerId && isMeasuring(shelf)) {
      event.preventDefault();
      updateMeasurement(shelf, null, rackPhysicalMeasurePoint(canvasMeasurePointFromEvent(event, canvas, visualShelf), viewRange), false, canvasMeasureSize(canvas));
      canvas.querySelector('.measure-overlay')?.replaceWith(renderMeasureOverlay(rackVisualMeasurement(activeMeasurement(shelf), viewRange), { width: visualShelf.columns, height: visualShelf.rows }, activeMeasurement(shelf)));
      return;
    }
    if (!dragDraft || !dragMarker) return;
    updateRackDoorSideFromPointer(event, canvas, viewRange);
    dragDraft = draftFromCorners(dragStart, canvasCellFromEvent(event, canvas, visualShelf), visualShelf);
    updateDragMarker(visualShelf, dragMarker, dragDraft);
  });

  canvas.addEventListener('pointerup', event => {
    if (measuringPointer === event.pointerId && isMeasuring(shelf)) {
      event.preventDefault();
      updateMeasurement(shelf, null, rackPhysicalMeasurePoint(canvasMeasurePointFromEvent(event, canvas, visualShelf), viewRange), true, canvasMeasureSize(canvas));
      measuringPointer = null;
      render();
      return;
    }
    if (!dragDraft || !dragMarker) return;
    const draft = rackVisualToLocal(dragDraft, viewRange);
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    dragMarker.remove();
    dragStart = null;
    dragDraft = null;
    dragMarker = null;
    applyDraftSelection(shelf, draft);
    render();
    els.packageName.focus({ preventScroll: true });
    window.scrollTo(scrollPosition.x, scrollPosition.y);
    window.requestAnimationFrame(() => window.scrollTo(scrollPosition.x, scrollPosition.y));
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
    const visualDraft = rackLocalToVisual(draftAtCell(
      { row: draft.row, column: draft.column },
      shelf,
      { width: draft.width, depth: draft.depth }
    ), viewRange);
    marker.className = 'draft-marker';
    marker.innerHTML = draftMarkerHtml(draft);
    decorateDraftMarker(marker, visualDraft, visualShelf);
    updateDragMarker(visualShelf, marker, visualDraft);
    marker.addEventListener('pointerdown', event => startDraftEdit(event, canvas, shelf, marker, draft, viewRange));
    canvas.append(marker);
  }

  const renderedPackages = [];
  orderedForStacking(shelf.packages).forEach(item => {
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
    if (selectedPackage) displayItem.note = isDoorItem(displayItem)
      ? currentDoorNote()
      : noteWithHeight(els.note.value, cmInputToCm(els.heightUnits.value, itemHeightCm(item)));
    const visualDisplayItem = rackLocalToVisual({
      column: displayItem.column_index,
      row: displayItem.row_index,
      width: displayItem.width_units || 1,
      depth: displayItem.depth_units || 1
    }, viewRange);
    rectangle.className = `package-rect ${selectedPackage ? 'selected' : ''}`;
    rectangle.classList.toggle('blocked-zone', isBlockedItem(displayItem));
    rectangle.classList.toggle('reserve-zone', isYellowZone(displayItem));
    rectangle.classList.toggle('column-element', specialKind(displayItem) === 'column');
    rectangle.classList.toggle('corridor-element', specialKind(displayItem) === 'corridor');
    rectangle.classList.toggle('door-element', isDoorItem(displayItem));
    rectangle.classList.toggle('column-visual', specialKind(displayItem) === 'column');
    rectangle.classList.toggle('corridor-visual', specialKind(displayItem) === 'corridor');
    rectangle.classList.toggle('door-visual', isDoorItem(displayItem));
    rectangle.classList.toggle('door-flipped', isDoorItem(displayItem) && doorIsFlipped(displayItem));
    if (isDoorItem(displayItem)) {
      const physicalSide = doorSide(displayItem, shelf);
      const visualSide = rackLevelRotated(viewRange)
        ? ({ left: 'top', right: 'bottom', top: 'left', bottom: 'right' }[physicalSide] || physicalSide)
        : physicalSide;
      rectangle.classList.add(`door-${visualSide}`);
    }
    rectangle.classList.toggle('stacked-zone', isStackedItem(displayItem));
    rectangle.classList.toggle('overlapping-item', renderedPackages.some(previous => (
      !isZoneItem(previous) && !isDoorItem(previous) && !isZoneItem(displayItem) && !isDoorItem(displayItem) && rectsOverlap(packageRect(previous), packageRect(displayItem))
    )));
    rectangle.type = 'button';
    rectangle.style.left = `${((visualDisplayItem.column - 1) / visualShelf.columns) * 100}%`;
    rectangle.style.top = `${((visualDisplayItem.row - 1) / visualShelf.rows) * 100}%`;
    rectangle.style.width = `${(visualDisplayItem.width / visualShelf.columns) * 100}%`;
    rectangle.style.height = `${(visualDisplayItem.depth / visualShelf.rows) * 100}%`;
    if (isDoorItem(displayItem)) {
      const side = [...rectangle.classList].find(name => name.startsWith('door-') && name !== 'door-element');
      if (side === 'door-top') rectangle.style.top = '0%';
      if (side === 'door-bottom') rectangle.style.top = '100%';
      if (side === 'door-left') rectangle.style.left = '0%';
      if (side === 'door-right') rectangle.style.left = '100%';
    }
    rectangle.dataset.tooltip = packageTooltip(displayItem);
    rectangle.setAttribute('aria-label', displayPackageName(item));
    rectangle.innerHTML = packageHtml(displayItem, selectedPackage);
    rectangle.addEventListener('pointerdown', event => {
      if (!selectedPackage) return;
      startPackageEdit(event, canvas, shelf, item, rectangle, displayItem, viewRange);
    });
    rectangle.addEventListener('click', event => {
      if (rectangle.dataset.dragged === 'true') {
        rectangle.dataset.dragged = 'false';
        return;
      }
      selectOverlappingItem(shelf, item, renderedPackages);
    });
    canvas.append(rectangle);
    renderedPackages.push(displayItem);
  });

  if (!shelf.packages.length && (!draft || draft.shelf.id !== shelf.id)) {
    const empty = document.createElement('div');
    empty.className = 'canvas-empty';
    empty.textContent = 'Available area';
    canvas.append(empty);
  }

  return canvas;
}

function selectOverlappingItem(shelf, clickedItem, previouslyRendered) {
  const overlapping = previouslyRendered
    .filter(item => String(item.id) !== String(clickedItem.id) && !isZoneItem(item) && !isDoorItem(item) && rectsOverlap(packageRect(item), packageRect(clickedItem)))
    .reverse();
  const choices = [clickedItem, ...overlapping];
  const selectedId = els.packageId.value;
  const selectedIndex = choices.findIndex(item => String(item.id) === String(selectedId));
  const item = choices[(selectedIndex + 1) % choices.length];
  selectCell(shelf, item.row_index, item.column_index, item);
}

function findFloorStackGroups(shelf) {
  const packages = (shelf.packages || []).filter(item => !isZoneItem(item) && !isDoorItem(item));
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
    <span class="measure">${formatSizeCm(rect.width, rect.depth)} · h ${formatNumber(totalHeight * 10)} mm</span>
    <span class="pkg">${group.map(item => escapeHtml(item.package_name)).join('<br>')}</span>
    <span class="note">${group.map(item => `${escapeHtml(stackCount(item))}x ${formatNumber(stackTotalHeightCm(item) * 10)} mm`).join(' · ')}</span>
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
  if (marker.classList.contains('door-visual')) {
    marker.classList.remove('door-top', 'door-right', 'door-bottom', 'door-left');
    const item = draftAsItem(draft, 'door');
    marker.classList.add(`door-${doorSide(item, shelf)}`);
    placeDoorOutside(marker, item, shelf);
  }
}

function updateDoorSideFromPointer(event, canvas) {
  if (draftSpecialKind() !== 'door') return false;
  const rect = canvas.getBoundingClientRect();
  const outside = [
    ['top', rect.top - event.clientY],
    ['right', event.clientX - rect.right],
    ['bottom', event.clientY - rect.bottom],
    ['left', rect.left - event.clientX]
  ].sort((a, b) => b[1] - a[1]);
  const [side, distance] = outside[0];
  if (distance < 8 || side === els.doorSideValue.value) return false;
  els.doorSideValue.value = side;
  els.doorFlippedValue.value = '0';
  return true;
}

function renderDimensionLabels(shelf, kind, role = planRole(shelf)) {
  const labels = document.createElement('div');
  labels.className = 'dimension-labels';
  labels.innerHTML = `
    <span class="dim dim-top">${formatNumber(shelf.columns * 10)} mm</span>
    <span class="dim dim-left">${formatNumber(shelf.rows * 10)} mm</span>
    ${kind === 'shelf' ? '<span class="dim dim-bays">6,000 mm length</span>' : ''}
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

function startDraftEdit(event, canvas, shelf, marker, draft, viewRange = { width: shelf.columns, height: shelf.rows }) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.target.dataset.handle || 'move';
  const visualShelf = rackVisualShelf(viewRange);
  const visualDraft = rackLocalToVisual(draft, viewRange);
  const startCell = canvasCellFromEvent(event, canvas, visualShelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - visualDraft.column,
    row: startCell.row - visualDraft.row
  };

  const move = moveEvent => {
    if (handle === 'move') updateRackDoorSideFromPointer(moveEvent, canvas, viewRange);
    const cell = canvasCellFromEvent(moveEvent, canvas, visualShelf);
    const nextVisualDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        visualShelf,
        { width: visualDraft.width, depth: visualDraft.depth }
      )
      : resizeDraftFromPointer(visualDraft, handle, startPointer, moveEvent, canvas, visualShelf);

    const adjusted = setDraftFormValues(shelf, rackVisualToLocal(nextVisualDraft, viewRange));
    updateDragMarker(visualShelf, marker, rackLocalToVisual(adjusted, viewRange));
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
  const visualShelf = rackVisualShelf(range);
  const visualDraft = rackLocalToVisual(localDraft, range);
  const startCell = canvasCellFromEvent(event, canvas, visualShelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - visualDraft.column,
    row: startCell.row - visualDraft.row
  };

  const move = moveEvent => {
    if (handle === 'move') updateRackDoorSideFromPointer(moveEvent, canvas, range);
    const cell = canvasCellFromEvent(moveEvent, canvas, visualShelf);
    const nextVisualDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        visualShelf,
        { width: visualDraft.width, depth: visualDraft.depth }
      )
      : resizeDraftFromPointer(visualDraft, handle, startPointer, moveEvent, canvas, visualShelf);
    const adjusted = setDraftFormValues(shelf, rackGlobalDraft(shelf, range, rackVisualToLocal(nextVisualDraft, range)));
    const adjustedLocal = rackLocalDraft({
      row: adjusted.row,
      column: adjusted.column,
      width: adjusted.width,
      depth: adjusted.depth
    }, range);
    updateDragMarker(visualShelf, marker, rackLocalToVisual(adjustedLocal, range));
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
  const visualShelf = rackVisualShelf(range);
  const localDraft = rackLocalDraft({
    row: displayItem.row_index,
    column: displayItem.column_index,
    width: displayItem.width_units || 1,
    depth: displayItem.depth_units || 1
  }, range);
  const visualDraft = rackLocalToVisual(localDraft, range);
  const startCell = canvasCellFromEvent(event, canvas, visualShelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - visualDraft.column,
    row: startCell.row - visualDraft.row
  };
  let moved = false;

  const move = moveEvent => {
    const distance = Math.hypot(moveEvent.clientX - startPointer.x, moveEvent.clientY - startPointer.y);
    if (!moved && distance < 6) return;
    moved = true;
    if (handle === 'move') updateRackDoorSideFromPointer(moveEvent, canvas, range);
    const cell = canvasCellFromEvent(moveEvent, canvas, visualShelf);
    const nextVisualDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        visualShelf,
        { width: visualDraft.width, depth: visualDraft.depth }
      )
      : resizeDraftFromPointer(visualDraft, handle, startPointer, moveEvent, canvas, visualShelf);
    const adjusted = setPackageEditFormValues(shelf, rackGlobalDraft(shelf, range, rackVisualToLocal(nextVisualDraft, range)));
    const adjustedLocal = rackLocalDraft({
      row: adjusted.row,
      column: adjusted.column,
      width: adjusted.width,
      depth: adjusted.depth
    }, range);
    const adjustedVisual = rackLocalToVisual(adjustedLocal, range);
    updateDragMarker(visualShelf, rectangle, adjustedVisual);
    rectangle.classList.toggle('compact-label', !rackPackageLabelFits(adjustedVisual.width, adjustedVisual.depth));
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

function startPackageEdit(event, canvas, shelf, item, rectangle, displayItem, viewRange = { width: shelf.columns, height: shelf.rows }) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.target.dataset.handle || 'move';
  const draft = {
    row: displayItem.row_index,
    column: displayItem.column_index,
    width: displayItem.width_units || 1,
    depth: displayItem.depth_units || 1
  };
  const visualShelf = rackVisualShelf(viewRange);
  const visualDraft = rackLocalToVisual(draft, viewRange);
  const startCell = canvasCellFromEvent(event, canvas, visualShelf);
  const startPointer = { x: event.clientX, y: event.clientY };
  const grabOffset = {
    column: startCell.column - visualDraft.column,
    row: startCell.row - visualDraft.row
  };
  let moved = false;

  const move = moveEvent => {
    const distance = Math.hypot(moveEvent.clientX - startPointer.x, moveEvent.clientY - startPointer.y);
    if (!moved && distance < 6) return;
    moved = true;
    if (handle === 'move') updateRackDoorSideFromPointer(moveEvent, canvas, viewRange);
    const cell = canvasCellFromEvent(moveEvent, canvas, visualShelf);
    const nextVisualDraft = handle === 'move'
      ? draftAtCell(
        { column: cell.column - grabOffset.column, row: cell.row - grabOffset.row },
        visualShelf,
        { width: visualDraft.width, depth: visualDraft.depth }
      )
      : resizeDraftFromPointer(visualDraft, handle, startPointer, moveEvent, canvas, visualShelf);
    const adjusted = setPackageEditFormValues(shelf, rackVisualToLocal(nextVisualDraft, viewRange));
    displayItem.row_index = adjusted.row;
    displayItem.column_index = adjusted.column;
    displayItem.width_units = adjusted.width;
    displayItem.depth_units = adjusted.depth;
    updateDragMarker(visualShelf, rectangle, rackLocalToVisual(adjusted, viewRange));
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
    shelfId: shelf.id,
    packageId: item.id,
    locationType: placeKind(shelf),
    shelfName: shelf.name,
    shelfRows: internalCmToMeters(savingShelf.rows, savingShelf.rows),
    shelfColumns: internalCmToMeters(savingShelf.columns, savingShelf.columns),
    rowIndex: draft.row,
    columnIndex: draft.column,
    widthUnits: internalCmToMeters(item.width_units || 1, item.width_units || 1),
    depthUnits: internalCmToMeters(item.depth_units || 1, item.depth_units || 1),
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

  if (!shelves.length) {
    els.model3d.innerHTML = '';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'model3d-grid';

  shelves.forEach(shelf => {
    const rackSelection = planPlaceRole(shelf) === 'rack' ? (appState.model3d.rackLevels[shelf.id] || 'all') : 'all';
    const modelShelf = model3dDisplayShelf(shelf, rackSelection);
    const view = modelViewState(modelShelf.modelId || modelShelf.id);
    const card = document.createElement('section');
    card.className = `model3d-card ${planPlaceRole(shelf) === 'rack' ? 'rack-model-card' : ''}`;
    card.innerHTML = `
      <div class="model3d-head">
        <div class="model3d-title">
          <strong>${escapeHtml(displayAreaName(modelShelf.label || modelShelf.name))}</strong>
          <span>${escapeHtml(modelHeightSummary(modelShelf))}</span>
        </div>
        <div class="model3d-controls" aria-label="3D controls">
          ${planPlaceRole(shelf) === 'rack' ? model3dRackLevelButtons(shelf, rackSelection) : ''}
          <button type="button" data-model-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" data-model-zoom="out" aria-label="Zoom out">-</button>
          <button type="button" data-model-zoom="reset">Reset</button>
          <button type="button" data-model-fullscreen aria-label="Open 3D view in fullscreen">Fullscreen</button>
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
      createThreeAreaScene(viewport, modelShelf, view);
    }

    card.append(viewport);
    grid.append(card);
    attachModel3dZoomButtons(card, view);
    attachModel3dFullscreenButton(card);
    attachModel3dRackLevelButtons(card, shelf);
  });

  els.model3d.innerHTML = '';
  els.model3d.append(grid);
}

function model3dDisplayShelf(shelf, selection = 'all') {
  if (planPlaceRole(shelf) !== 'rack') return shelf;
  if (isCustomRack(shelf)) return model3dCustomRack(shelf, selection);
  if (selection !== 'all') {
    const level = Number(selection) || 1;
    const range = rackLevelRange(shelf, level);
    return {
      ...shelf,
      modelId: `${shelf.id}:rack-level-${level}`,
      name: `${shelf.name} · ${range.label}`,
      label: `${shelf.label || shelf.name} · ${range.label}`,
      rows: range.height,
      columns: range.width,
      packages: rackLevelPackages(shelf, range).map(item => ({ ...item, modelRackLevel: level, modelBaseHeightCm: 0 })),
      modelHeightCm: range.maxHeight || (range.short ? 16 : 65),
      modelDimensionLabel: range.heightLabel,
      modelIsRackLevel: true,
      modelShowsAllLevels: false,
      notes: shelf.notes
    };
  }
  const rackOrder = rackOrderFromNotes(shelf.notes);
  const modelPackages = rackLevelSpecs(shelf).flatMap(spec => {
    const range = rackLevelRange(shelf, spec.level);
    const baseHeight = spec.short ? 0 : 16 + (Math.max(0, rackOrder.indexOf(spec.level)) * 65);
    return rackLevelPackages(shelf, range).map(item => ({
      ...item,
      column_index: spec.short ? item.column_index + Math.max(0, shelf.columns - range.width) : item.column_index,
      modelRackLevel: spec.level,
      modelBaseHeightCm: baseHeight
    }));
  });
  return {
    ...shelf,
    id: shelf.id,
    modelId: `${shelf.id}:complete-rack`,
    name: shelf.name,
    label: shelf.label || shelf.name,
    rows: 90,
    columns: shelf.columns,
    packages: modelPackages,
    modelHeightCm: 211,
    modelDimensionLabel: `${formatSizeCm(shelf.columns, 90)} · 3 levels x 650 mm · small rack ${formatNumber(Math.min(150, shelf.columns) * 10)} x 900 x 160 mm`,
    modelIsRackLevel: true,
    modelShowsAllLevels: true,
    modelRackOrder: rackOrder,
    notes: shelf.notes
  };
}

function model3dCustomRack(parent, selection = 'all') {
  const layout = rackLayoutFromNotes(parent);
  const specs = rackLevelSpecs(parent);
  if (selection !== 'all') {
    const levelId = String(selection).replace(/^sub:/, '');
    const level = layout.find(item => String(item.id) === levelId);
    const spec = specs.find(item => String(item.layoutId) === levelId);
    if (level && spec) {
      const range = rackLevelRange(parent, spec.level);
      return {
        ...parent,
        modelId: `${parent.id}:sub-rack-${level.id}`,
        label: `${parent.label || parent.name} · ${level.name}`,
        rows: level.depth,
        columns: level.width,
        packages: rackLevelPackages(parent, range).map(item => ({ ...item, modelRackLevel: level.id, modelBaseHeightCm: 0 })),
        modelHeightCm: level.height,
        modelDimensionLabel: `${formatSizeCm(level.width, level.depth)} x ${formatNumber(level.height * 10)} mm high`,
        modelIsRackLevel: true,
        modelShowsAllLevels: false,
        modelCustomRack: false
      };
    }
  }
  const width = layout.length ? Math.max(1, ...layout.map(level => level.width)) : Math.max(1, parent.columns || 1);
  const depth = layout.length ? Math.max(1, ...layout.map(level => level.depth)) : 1;
  let baseHeight = 0;
  const shelves = layout.map(level => {
    const spec = specs.find(item => String(item.layoutId) === String(level.id));
    const model = { level, spec, baseHeight };
    baseHeight += level.height;
    return model;
  });
  const packages = shelves.flatMap(({ level, spec, baseHeight: levelBase }) => {
    if (!spec) return [];
    return rackLevelPackages(parent, rackLevelRange(parent, spec.level)).map(item => ({
      ...item,
      column_index: (item.column_index || 1) + ((width - level.width) / 2),
      row_index: (item.row_index || 1) + ((depth - level.depth) / 2),
      modelRackLevel: level.id,
      modelBaseHeightCm: levelBase
    }));
  });
  return {
    ...parent,
    modelId: `${parent.id}:custom-rack`,
    rows: depth,
    columns: width,
    packages,
    modelHeightCm: Math.max(1, baseHeight),
    modelDimensionLabel: layout.length
      ? `${formatSizeCm(width, depth)} · ${formatNumber(baseHeight * 10)} mm total height · ${layout.length} sub-rack(s)`
      : 'Empty rack · edit the rack to define its internal sub-racks',
    modelIsRackLevel: true,
    modelShowsAllLevels: true,
    modelCustomRack: true,
    modelRackShelves: shelves.map(({ level, baseHeight: levelBase }) => ({
      id: level.id,
      name: level.name,
      width: level.width,
      depth: level.depth,
      baseHeight: levelBase,
      height: level.height
    }))
  };
}

function model3dRackLevelButtons(shelf, selection = 'all') {
  if (isCustomRack(shelf)) {
    return `
      <span class="model3d-levels" aria-label="Sub-racks">
        <button type="button" data-model-rack-level="all" class="${selection === 'all' ? 'active' : ''}">All</button>
        ${rackLayoutFromNotes(shelf).map((level, index) => `
          <button type="button" data-model-rack-level="sub:${escapeHtml(level.id)}" class="${String(selection) === `sub:${level.id}` ? 'active' : ''}">
            ${index + 1}. ${escapeHtml(level.name)}
          </button>
        `).join('')}
      </span>
    `;
  }
  return `
    <span class="model3d-levels" aria-label="Rack levels">
      <button type="button" data-model-rack-level="all" class="${selection === 'all' ? 'active' : ''}">All</button>
      ${rackLevelSpecs(shelf).map(spec => `
        <button type="button" data-model-rack-level="${spec.level}" class="${String(selection) === String(spec.level) ? 'active' : ''}">
          ${escapeHtml(spec.short ? 'Small' : `Level ${spec.level}`)}
        </button>
      `).join('')}
    </span>
  `;
}

function modelHeightSummary(shelf) {
  if (shelf.modelIsRackLevel) {
    return shelf.modelDimensionLabel;
  }
  return `max height ${formatNumber(maxStackHeightForShelf(shelf) * 10)} mm`;
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
  const depthCm = Math.max(1, shelf.modelIsRackLevel ? shelf.rows : (effectiveRowsForShelf(shelf) || shelf.rows || 1));
  const maxDim = Math.max(widthCm, depthCm, 100);
  const scale = 8 / maxDim;
  // Keep width, depth and height on one scale so defined heights stay proportional.
  const heightScale = scale;
  const areaWidth = widthCm * scale;
  const areaDepth = depthCm * scale;
  const legacyCompleteRack = shelf.modelShowsAllLevels && !shelf.modelCustomRack;
  const smallRackWidth = legacyCompleteRack ? Math.min(150, widthCm) * scale : areaWidth;
  const baseWidth = legacyCompleteRack ? smallRackWidth : areaWidth;
  const baseOffsetX = legacyCompleteRack ? (areaWidth - smallRackWidth) / 2 : 0;

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
  const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(baseWidth, 0.08, areaDepth), floorMaterial);
  floorMesh.position.set(baseOffsetX, -0.04, 0);
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(floorMesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x6f7d80, transparent: true, opacity: 0.55 })
  );
  edge.position.copy(floorMesh.position);
  root.add(edge);

  if (shelf.modelIsRackLevel) {
    const rackBottomCm = legacyCompleteRack ? 16 : 0;
    const rackHeight = Math.max(1, (shelf.modelHeightCm || 65) - rackBottomCm) * heightScale;
    const rackBoundsGeometry = new THREE.BoxGeometry(areaWidth, rackHeight, areaDepth);
    const rackBounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(rackBoundsGeometry),
      new THREE.LineBasicMaterial({ color: 0x6f7d80, transparent: true, opacity: 0.72 })
    );
    rackBounds.position.y = (rackBottomCm * heightScale) + (rackHeight / 2);
    root.add(rackBounds);

    if (shelf.modelCustomRack) {
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x728083, roughness: 0.58, metalness: 0.34 });
      const boardMaterial = new THREE.MeshStandardMaterial({ color: 0xdce7e6, roughness: 0.72, metalness: 0.08 });
      const postSize = Math.max(0.05, 4 * scale);
      (shelf.modelRackShelves || []).forEach(subRack => {
        const shelfWidth = subRack.width * scale;
        const shelfDepth = subRack.depth * scale;
        const bottom = subRack.baseHeight * heightScale;
        const top = (subRack.baseHeight + subRack.height) * heightScale;
        [bottom, top].forEach(y => {
          const board = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth, 0.08, shelfDepth), boardMaterial);
          board.position.y = y;
          board.receiveShadow = true;
          root.add(board);
        });
        [[-shelfWidth / 2, -shelfDepth / 2], [shelfWidth / 2, -shelfDepth / 2], [-shelfWidth / 2, shelfDepth / 2], [shelfWidth / 2, shelfDepth / 2]].forEach(([x, z]) => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, Math.max(0.05, top - bottom), postSize), frameMaterial);
          post.position.set(x, bottom + ((top - bottom) / 2), z);
          post.castShadow = true;
          root.add(post);
        });
      });
    } else if (shelf.modelShowsAllLevels) {
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x728083, roughness: 0.58, metalness: 0.34 });
      const boardMaterial = new THREE.MeshStandardMaterial({ color: 0xdce7e6, roughness: 0.72, metalness: 0.08 });
      [16, 81, 146, 211].forEach(heightCm => {
        const board = new THREE.Mesh(new THREE.BoxGeometry(areaWidth, 0.08, areaDepth), boardMaterial);
        board.position.y = heightCm * heightScale;
        board.receiveShadow = true;
        root.add(board);
      });
      const postHeight = 195 * heightScale;
      const postSize = Math.max(0.05, 4 * scale);
      [
        [-areaWidth / 2, -areaDepth / 2],
        [areaWidth / 2, -areaDepth / 2],
        [-areaWidth / 2, areaDepth / 2],
        [areaWidth / 2, areaDepth / 2]
      ].forEach(([x, z]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, postHeight, postSize), frameMaterial);
        post.position.set(x, (16 * heightScale) + (postHeight / 2), z);
        post.castShadow = true;
        root.add(post);
      });
      const smallWidth = smallRackWidth;
      const smallTop = new THREE.Mesh(new THREE.BoxGeometry(smallWidth, 0.08, areaDepth), boardMaterial);
      smallTop.position.set((areaWidth - smallWidth) / 2, 16 * heightScale, 0);
      root.add(smallTop);
      const smallPostHeight = 16 * heightScale;
      const smallLeft = areaWidth / 2 - smallWidth;
      [smallLeft, areaWidth / 2].forEach(x => {
        [-areaDepth / 2, areaDepth / 2].forEach(z => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, smallPostHeight, postSize), frameMaterial);
          post.position.set(x, smallPostHeight / 2, z);
          root.add(post);
        });
      });
    }
  }

  const gridSize = Math.max(baseWidth, areaDepth);
  const grid = new THREE.GridHelper(gridSize, 12, 0xa8b6b8, 0xd2dddd);
  grid.scale.x = baseWidth / gridSize;
  grid.scale.z = areaDepth / gridSize;
  grid.position.set(baseOffsetX, 0.02, 0);
  root.add(grid);

  const renderedItems = [];
  orderedForStacking(shelf.packages).filter(item => !isDoorItem(item)).forEach(item => {
    const overlaps = renderedItems.filter(previous => (
      previous.modelRackLevel === item.modelRackLevel && rectsOverlap(packageRect(previous), packageRect(item))
    ));
    const storedStackBase = stackBaseHeightCm(item);
    const localBaseHeight = storedStackBase === null
      ? overlaps.reduce((sum, previous) => sum + stackTotalHeightCm(previous), 0)
      : storedStackBase;
    const baseHeightCm = (item.modelBaseHeightCm || 0) + localBaseHeight;
    renderThreeItem(root, item, scale, heightScale, widthCm, depthCm, {
      baseHeightCm,
      translucent: overlaps.length > 0,
      rackItem: Boolean(shelf.modelIsRackLevel)
    });
    renderedItems.push(item);
  });

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
  const tooltip = document.createElement('div');
  tooltip.className = 'model3d-tooltip hidden';
  viewport.append(tooltip);

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
  attachModel3dTooltip(viewport, renderer, camera, scene, tooltip);
}

function renderThreeItem(root, item, scale, heightScale, widthCm, depthCm, options = {}) {
  if (isDoorItem(item)) return;
  const zone = zoneKind(item);
  const kind = specialKind(item);
  const count = zone || kind === 'door' ? 1 : Math.min(stackCount(item), 12);
  const height = kind === 'door' ? 210 : itemHeightCm(item);
  const baseHeight = Math.max(0, options.baseHeightCm || 0) * heightScale;
  const boxWidth = Math.max(0.06, (item.width_units || 1) * scale);
  const boxDepth = Math.max(0.06, (item.depth_units || 1) * scale);
  const layerHeight = Math.max(0.06, height * heightScale);
  let x = (((item.column_index || 1) - 1) + ((item.width_units || 1) / 2) - (widthCm / 2)) * scale;
  let z = (((item.row_index || 1) - 1) + ((item.depth_units || 1) / 2) - (depthCm / 2)) * scale;
  if (kind === 'door') {
    const side = doorSide(item, { columns: widthCm, rows: depthCm });
    if (side === 'left') x = (-widthCm / 2 - 5) * scale;
    if (side === 'right') x = (widthCm / 2 + 5) * scale;
    if (side === 'top') z = (-depthCm / 2 - 5) * scale;
    if (side === 'bottom') z = (depthCm / 2 + 5) * scale;
  }
  const color = kind === 'door'
    ? 0x151515
    : kind === 'column'
      ? 0x343b3f
      : kind === 'corridor'
        ? 0xdce1e3
        : zone === 'red'
          ? 0xea8a96
          : zone === 'yellow'
            ? 0xf2d16d
            : 0xe6a447;
  const opacity = zone && kind !== 'column' ? 0.65 : options.rackItem ? 0.9 : 1;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.64,
    metalness: 0.04,
    transparent: opacity < 1,
    opacity
  });
  const edgeColor = kind === 'column' ? 0x161a1c : kind === 'corridor' ? 0x737b7f : zone === 'red' ? 0x9f2331 : 0x5f4327;
  const edgeMaterial = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.55 });

  for (let index = 0; index < count; index += 1) {
    const geometry = new THREE.BoxGeometry(boxWidth, layerHeight, boxDepth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, baseHeight + (layerHeight / 2) + (index * layerHeight), z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.tooltip = packageTooltip(item);
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
    <span class="model3d-area-label">${escapeHtml(displayAreaName(shelf.label || shelf.name))}</span>
    ${shelf.modelCustomRack ? `
      ${(shelf.modelRackShelves || []).map((subRack, index) => `<span>${index === 0 ? 'Bottom' : index === shelf.modelRackShelves.length - 1 ? 'Top' : `Position ${index + 1}`} · ${escapeHtml(subRack.name)} · ${formatNumber(subRack.baseHeight * 10)}–${formatNumber((subRack.baseHeight + subRack.height) * 10)} mm</span>`).join('')}
    ` : shelf.modelShowsAllLevels ? `
      ${(shelf.modelRackOrder || [1, 2, 3]).map((level, index) => `<span>${index === 0 ? 'Bottom' : index === 1 ? 'Middle' : 'Top'} · Level ${level} · ${formatNumber((16 + (index * 65)) * 10)}–${formatNumber((81 + (index * 65)) * 10)} mm</span>`).join('')}
      <span>Small rack · below bottom-right · 0–160 mm</span>
    ` : ''}
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

function attachModel3dTooltip(viewport, renderer, camera, scene, tooltip) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const updateTooltip = event => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(scene.children, true).find(item => item.object.userData?.tooltip);
    if (!hit) {
      tooltip.classList.add('hidden');
      return;
    }
    tooltip.textContent = hit.object.userData.tooltip;
    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.style.top = `${event.clientY - rect.top}px`;
    tooltip.classList.remove('hidden');
  };
  viewport.addEventListener('pointermove', updateTooltip);
  viewport.addEventListener('pointerleave', () => tooltip.classList.add('hidden'));
  viewport.addEventListener('pointerdown', () => tooltip.classList.add('hidden'));
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

function attachModel3dFullscreenButton(card) {
  const button = card.querySelector('[data-model-fullscreen]');
  if (!button) return;
  const updateLabel = () => {
    const active = document.fullscreenElement === card;
    button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Open 3D view in fullscreen');
  };
  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === card) {
        await document.exitFullscreen();
      } else {
        const onFullscreenChange = () => {
          updateLabel();
          if (!document.fullscreenElement) document.removeEventListener('fullscreenchange', onFullscreenChange);
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        await card.requestFullscreen();
      }
      updateLabel();
    } catch (error) {
      showMessage('Fullscreen mode is not available in this browser.', 'error');
    }
  });
  updateLabel();
}

function attachModel3dRackLevelButtons(card, shelf) {
  card.querySelectorAll('[data-model-rack-level]').forEach(button => {
    button.addEventListener('click', () => {
      const selection = button.dataset.modelRackLevel;
      appState.model3d.rackLevels[shelf.id] = selection;
      if (/^\d+$/.test(selection)) appState.activeRackLevel = Number.parseInt(selection, 10) || 1;
      render();
    });
  });
}

function renderPlaces() {
  if (!appState.shelves.length) return;
  renderPlaceGroup(`All areas (${appState.shelves.length})`, appState.shelves);
}

function renderPlaceGroup(title, places, muted = false) {
  const group = document.createElement('section');
  group.className = `place-group ${muted ? 'old-place-group' : ''}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.append(heading);
  places.forEach(place => {
    const kind = placeKind(place);
    const internalLevels = isCustomRack(place) ? rackLayoutFromNotes(place) : [];
    const sizeSummary = internalLevels.length
      ? `${internalLevels.length} internal sub-rack(s) · footprint ${formatSizeCm(Math.max(...internalLevels.map(level => level.width)), Math.max(...internalLevels.map(level => level.depth)))}`
      : formatSizeCm(place.columns, place.rows);
    const item = document.createElement('article');
    item.className = `place-item ${kind === 'floor' ? 'floor-place-item' : ''} ${muted ? 'old-place-item' : ''}`;
    item.innerHTML = `
      <div>
        <span class="place-type">${placeLabel(kind)}</span>
        <h3>${escapeHtml(displayAreaName(place.label || place.name))}</h3>
        <p>${sizeSummary}</p>
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
  els.placeParentId.value = parentRackId(place);
  els.placeLocationType.value = placeKind(place);
  els.placeName.value = displayAreaName(place.name);
  els.placeRows.value = inputCm(place.rows);
  els.placeColumns.value = inputCm(place.columns);
  els.placeHeight.value = inputCm(areaMaxHeightCm(place, placeKind(place) === 'floor' ? 220 : 65));
  els.placeNotes.value = visiblePlaceNotes(place.notes);
  els.rackModeValue.value = isCustomRack(place) ? 'custom' : '';
  renderRackStructureEditor(isCustomRack(place) ? rackLayoutFromNotes(place) : []);
  syncRackStructureControls();
  els.savePlaceButton.textContent = 'Update area';
  els.cancelPlaceButton.classList.remove('hidden');
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
  const kind = specialKind(item);
  const count = stackCount(item);
  const height = itemHeightCm(item);
  const note = displayItemNote(item.note || '');
  return `
    <span class="measure">${formatSizeCm(item.width_units || 1, item.depth_units || 1)} · h ${formatNumber(count * height * 10)} mm</span>
    <span class="pkg">${escapeHtml(displayPackageName(item))}</span>
    <span class="note">${kind === 'door' ? 'visual marker · outside area · no space deducted' : zone ? `${kind === 'column' ? 'pillar' : escapeHtml(kind)} · full available height` : `${escapeHtml(count)}x stacked${note ? ` · ${escapeHtml(note)}` : ''}`}</span>
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
  shelfVolumeCache = new WeakMap();
  render();
}

async function submitPackage(event) {
  event.preventDefault();
  normalizeDecimalFields(els.shelfRows, els.shelfColumns, els.widthUnits, els.depthUnits, els.heightUnits);
  updateDraftFromSizeInputs();
  const payload = Object.fromEntries(new FormData(els.packageForm).entries());
  const selectedShelf = appState.selected?.shelf;
  if (selectedShelf?.id) payload.shelfId = selectedShelf.id;
  const payloadZone = zoneKind({ package_name: payload.packageName, note: payload.note });
  const payloadSpecial = specialKind({ package_name: payload.packageName, note: payload.note });
  let height = cmInputToCm(payload.heightUnits, 45);
  const quantity = stackCount(payload.quantity);
  const totalHeight = height * quantity;
  const candidateRect = {
    row: internalCm(payload.rowIndex, 1),
    column: internalCm(payload.columnIndex, 1),
    width: cmInputToCm(payload.widthUnits, 100),
    depth: cmInputToCm(payload.depthUnits, 100)
  };
  if (selectedShelf && payloadZone) {
    height = Math.min(height, maxStackHeightForShelf(selectedShelf, candidateRect));
    payload.heightUnits = inputCm(height);
  }
  if (selectedShelf && payloadSpecial !== 'door' && payloadZone !== 'red' && touchesForbiddenArea(selectedShelf, {
    row: candidateRect.row,
    column: candidateRect.column,
    width: candidateRect.width,
    depth: candidateRect.depth
  })) {
    showMessage('This red zone is blocked. Do not place items there.', 'error');
    return;
  }
  if (selectedShelf && !payloadZone && payloadSpecial !== 'door') {
    const maxHeight = maxStackHeightForShelf(selectedShelf, {
      row: candidateRect.row,
      column: candidateRect.column
    });
    const existingOverlapHeight = stackOverlapHeight(selectedShelf, candidateRect, payload.packageId);
    const combinedHeight = totalHeight + existingOverlapHeight;
    if (combinedHeight > maxHeight) {
      showMessage(`Stack is too high: ${formatNumber(combinedHeight * 10)} mm total, max ${formatNumber(maxHeight * 10)} mm here.`, 'error');
      return;
    }
    const overlappingItems = overlappingNormalItems(selectedShelf, candidateRect, payload.packageId);
    if (overlappingItems.length) {
      // Overlapping normal items form one vertical stack. New or moved items always go on top.
      payload.note = noteWithStackPlacement(payload.note, 'above', existingOverlapHeight);
    } else {
      payload.note = cleanStackMetadata(payload.note);
    }
  }
  payload.quantity = quantity;
  if (payloadSpecial === 'door') {
    const stableSide = els.doorSideValue.value || (selectedShelf
      ? nearestDoorSide({
        row_index: candidateRect.row,
        column_index: candidateRect.column,
        width_units: candidateRect.width,
        depth_units: candidateRect.depth
      }, shelfForSaving(selectedShelf))
      : 'left');
    payload.note = noteWithDoorState(cleanHeightFromNote(payload.note), stableSide, els.doorFlippedValue.value === '1');
  } else {
    payload.note = noteWithHeight(payload.note, height);
  }
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
  normalizeDecimalFields(els.placeRows, els.placeColumns, els.placeHeight);
  const payload = Object.fromEntries(new FormData(els.placeForm).entries());
  const maxHeightCm = cmInputToCm(payload.maxHeight, payload.locationType === 'floor' ? 220 : 65);
  const rackLayout = payload.locationType === 'shelf' && payload.rackMode === 'custom'
    ? rackLayoutFromEditor()
    : [];
  if (payload.locationType === 'shelf' && payload.rackMode === 'custom' && !rackLayout.length) {
    showMessage('Add at least one sub-rack inside this rack.', 'error');
    return;
  }
  payload.rows = cmInputToMeters(rackLayout.length ? Math.max(...rackLayout.map(level => level.start + level.depth - 1)) : payload.rows, planPlaces.rack.rows);
  payload.columns = cmInputToMeters(rackLayout.length ? Math.max(...rackLayout.map(level => level.width)) : payload.columns, 600);
  payload.notes = notesWithAreaMaxHeight(payload.notes, maxHeightCm);
  if (payload.locationType === 'shelf' && !payload.parentId && payload.rackMode === 'custom') {
    payload.notes = noteWithMarker(payload.notes, /(?:[;,]\s*)?rack-mode\s*:\s*custom/gi, 'rack-mode:custom');
    payload.notes = noteWithMarker(payload.notes, /(?:[;,]\s*)?rack-layout\s*:\s*[^;,\s]+/gi, rackLayoutMarker(rackLayout));
  }
  delete payload.rackMode;
  delete payload.rackLayout;
  const isEdit = Boolean(payload.id);
  const result = await apiFetch('/api/places', {
    method: isEdit ? 'PATCH' : 'POST',
    body: JSON.stringify(payload)
  });
  if (!isEdit && result.place?.id) {
    appState.activeAreaId = result.place.id;
    appState.activePlanRole = planPlaceRole(result.place) || 'other';
  }
  clearPlaceForm();
  appState.activeView = 'packages';
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
  for (const role of ['floor-main', 'floor-long']) {
    const existing = appState.shelves.find(shelf => planPlaceRole(shelf) === role);
    if (existing && !placeNeedsPlanUpdate(existing, role)) continue;
    const result = await saveDefaultPlanPlace(role, existing);
    if (result === 'updated') updated += 1;
    if (result === 'created') created += 1;
  }
  if (!created && !updated) {
    showMessage('The floor areas are already set up correctly. Racks are defined individually.');
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

els.toggleFitFinderButton?.addEventListener('click', () => {
  appState.fitFinder.open = !appState.fitFinder.open;
  renderFitFinder();
  if (appState.fitFinder.open) els.fitWidth.focus();
});

els.fitFinderForm?.addEventListener('submit', event => {
  event.preventDefault();
  const size = {
    width: cmInputToCm(els.fitWidth.value, 120),
    depth: cmInputToCm(els.fitDepth.value, 80),
    height: cmInputToCm(els.fitHeight.value, 45)
  };
  els.fitWidth.value = inputCm(size.width);
  els.fitDepth.value = inputCm(size.depth);
  els.fitHeight.value = inputCm(size.height);
  appState.fitFinder.searched = true;
  appState.fitFinder.matches = fitMatches(size);
  renderFitFinder();
});

if (els.defaultPlanButton) {
  els.defaultPlanButton.addEventListener('click', () => {
    createDefaultPlanPlaces().catch(error => showMessage(error.message, 'error'));
  });
}

els.packagesTab?.addEventListener('click', () => setActiveView('packages'));
els.placesTab?.addEventListener('click', () => setActiveView('places'));
els.backToOverviewButton?.addEventListener('click', () => {
  clearPlaceForm();
  setActiveView('packages');
});

els.packageForm.addEventListener('submit', event => {
  submitPackage(event).catch(error => showMessage(error.message, 'error'));
});

els.placeForm.addEventListener('submit', event => {
  submitPlace(event).catch(error => showMessage(error.message, 'error'));
});
els.addRackLevelButton?.addEventListener('click', addRackLevelDefinition);

els.placeLocationType.addEventListener('change', () => {
  if (!els.placeId.value && !els.placeParentId.value) {
    els.rackModeValue.value = els.placeLocationType.value === 'shelf' ? 'custom' : '';
  }
  syncRackStructureControls();
  if (!els.placeId.value) els.placeHeight.value = inputCm(els.placeLocationType.value === 'floor' ? 220 : 65);
});

els.cancelEditButton.addEventListener('click', () => {
  clearPackageForm();
  els.selectedCell.textContent = 'No area selected';
  render();
});

els.doorSideControls.addEventListener('click', event => {
  const button = event.target.closest('[data-door-side]');
  if (!button || !appState.selected?.shelf || draftSpecialKind() !== 'door') return;
  els.doorSideValue.value = button.dataset.doorSide;
  els.doorFlippedValue.value = '0';
  updateDraftFromSizeInputs();
});

els.deletePackageButton.addEventListener('click', async () => {
  if (!els.packageId.value) return;
  await deletePackage(els.packageId.value).catch(error => showMessage(error.message, 'error'));
  clearPackageForm();
  els.selectedCell.textContent = 'No area selected';
});

els.cancelPlaceButton.addEventListener('click', () => {
  clearPlaceForm();
  setActiveView('packages');
});
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
    els.widthUnits.value = formatNumber(numberValue(width, 1200));
    els.depthUnits.value = formatNumber(numberValue(depth, 800));
    els.heightUnits.value = formatNumber(numberValue(height, 450));
    els.packageName.value = name;
    els.quantity.value = quantity;
    els.note.value = note;
    els.doorSideValue.value = '';
    els.doorFlippedValue.value = '0';
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
    const kind = button.dataset.zoneKind;
    const definitions = {
      red: ['Red no-place zone', 'zone:red'],
      yellow: ['Yellow reserve zone', 'zone:yellow'],
      column: ['Pillar', 'element:column, zone:red'],
      corridor: ['Corridor', 'element:corridor, zone:yellow'],
      door: ['Door', 'element:door']
    };
    const [name, note] = definitions[kind] || definitions.red;
    els.packageName.value = name;
    els.quantity.value = 1;
    els.note.value = note;
    els.doorSideValue.value = '';
    els.doorFlippedValue.value = '0';
    if (kind === 'column') {
      els.widthUnits.value = '300';
      els.depthUnits.value = '300';
    }
    if (kind === 'corridor') {
      els.widthUnits.value = '1,200';
      els.depthUnits.value = '1,000';
    }
    if (appState.selected?.shelf && kind !== 'door') {
      els.heightUnits.value = inputCm(maxStackHeightForShelf(appState.selected.shelf, selectedDraft() || appState.selected));
    } else if (kind === 'door') {
      els.widthUnits.value = '900';
      els.depthUnits.value = '100';
      els.heightUnits.value = '2,100';
    }
    updateDraftFromSizeInputs();
  });
});

document.querySelectorAll('[data-place-preset]').forEach(button => {
  button.addEventListener('click', () => {
    const [name, type, rows, columns, notes, maxHeight] = button.dataset.placePreset.split('|');
    els.placeId.value = '';
    els.placeParentId.value = '';
    els.placeName.value = name;
    els.placeLocationType.value = type;
    els.placeRows.value = formatNumber(numberValue(rows, 4500));
    els.placeColumns.value = formatNumber(numberValue(columns, 6000));
    els.placeHeight.value = formatNumber(numberValue(maxHeight, type === 'floor' ? 2200 : 650));
    els.placeNotes.value = notes;
    els.rackModeValue.value = type === 'shelf' ? 'custom' : '';
    renderRackStructureEditor([]);
    syncRackStructureControls();
    els.savePlaceButton.textContent = 'Create area';
    els.cancelPlaceButton.classList.add('hidden');
  });
});

[els.shelfRows, els.shelfColumns, els.widthUnits, els.depthUnits, els.heightUnits, els.placeRows, els.placeColumns, els.placeHeight, els.fitWidth, els.fitDepth, els.fitHeight].filter(Boolean).forEach(input => {
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
