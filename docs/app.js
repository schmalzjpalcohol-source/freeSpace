const tokenKey = 'freespace_token';
const els = {
  loginForm: document.querySelector('#loginForm'),
  logoutButton: document.querySelector('#logoutButton'),
  refreshButton: document.querySelector('#refreshButton'),
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
  shelfName: document.querySelector('#shelfName'),
  shelfRows: document.querySelector('#shelfRows'),
  shelfColumns: document.querySelector('#shelfColumns'),
  rowIndex: document.querySelector('#rowIndex'),
  columnIndex: document.querySelector('#columnIndex'),
  widthUnits: document.querySelector('#widthUnits'),
  depthUnits: document.querySelector('#depthUnits'),
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
  activeRackLevel: 1,
  measurement: null
};

const planPlaces = {
  'floor-main': {
    title: 'Bodenplatz 1 - 880 x 380',
    rows: 380,
    columns: 880,
    notes: 'Sperrfläche rechts oben 80 x 100 cm'
  },
  rack: {
    title: 'Regal 600 x 90',
    rows: 90,
    columns: 600,
    notes: '4 Plätze à 150 x 90 cm, Kleinregal 150 x 90 cm, Höhe 16 cm'
  },
  'floor-long': {
    title: 'Bodenplatz 2 - 380 x 740',
    rows: 740,
    columns: 380,
    notes: 'Sperrfläche links oben 70 x 380 cm'
  }
};

function apiBase() {
  return (window.FREESPACE_API_BASE_URL || '').replace(/\/$/, '');
}

function showMessage(text, type = 'info') {
  const readable = {
    invalid_login: 'Benutzername oder Passwort ist falsch.',
    auth_config: 'Login-Tabelle ist nicht erreichbar. Prüfe SUPABASE_URL und ob app_users existiert.',
    login_version: 'Alter Login-Code ist noch deployed. Bitte Vercel neu deployen.'
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
  if (!base) throw new Error('API-URL fehlt.');
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
    ? `Angemeldet: ${appState.user.login}`
    : appState.token
      ? 'Angemeldet'
      : 'Nicht angemeldet';
}

function placeKind(shelf) {
  if (shelf.location_type === 'floor') return 'floor';
  if (shelf.location_type === 'shelf') return 'shelf';
  const name = String(shelf.name || '').toLowerCase();
  return name.startsWith('boden') || name.includes('boden') || name.includes('floor') ? 'floor' : 'shelf';
}

function placeLabel(kind) {
  return kind === 'floor' ? 'Bodenplatz' : 'Regal';
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
  return String(Math.max(1, Math.round(Number(cm) || 1)));
}

function formatSizeCm(width, depth) {
  return `${formatCm(width)} x ${formatCm(depth)} cm`;
}

function formatMeasureCm(cm) {
  return `${formatDecimal(cm)} cm`;
}

function inputCm(cm) {
  return formatCm(cm);
}

function cmInputToCm(value, fallbackCm = 100) {
  return Math.max(1, Math.round(Math.max(1, numberValue(value, fallbackCm))));
}

function cmInputToMeters(value, fallbackCm = 100) {
  return formatDecimal(cmInputToCm(value, fallbackCm) / 100);
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
  const freeRun = maxFreeRunCm(shelf);
  return `${formatCm(freeRun)} cm freie Länge`;
}

function rackLevelSpecs(shelf) {
  const width = Math.max(1, shelf.columns || planPlaces.rack.columns);
  const height = Math.max(1, shelf.rows || planPlaces.rack.rows);
  const bayWidth = Math.max(1, Math.round(width / 4));
  const fullDepth = Math.min(90, height);
  return [
    { level: 1, label: 'Regalplatz 1', start: 1, end: fullDepth, xStart: 1, xEnd: bayWidth, short: false },
    { level: 2, label: 'Regalplatz 2', start: 1, end: fullDepth, xStart: bayWidth + 1, xEnd: bayWidth * 2, short: false },
    { level: 3, label: 'Regalplatz 3', start: 1, end: fullDepth, xStart: (bayWidth * 2) + 1, xEnd: bayWidth * 3, short: false },
    { level: 4, label: 'Regalplatz 4', start: 1, end: fullDepth, xStart: (bayWidth * 3) + 1, xEnd: width, short: false },
    { level: 5, label: 'Kleinregal', start: 1, end: fullDepth, xStart: (bayWidth * 3) + 1, xEnd: width, short: true, heightLabel: 'Höhe 16 cm' }
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

function draftInRackRange(shelf, range, cell, size) {
  const width = Math.min(size.width, range.width);
  const depth = Math.min(size.depth, range.height);
  const column = clamp(range.xStart + cell.column - 1, range.xStart, Math.max(range.xStart, range.xEnd - width + 1));
  const row = clamp(range.start + cell.row - 1, range.start, Math.max(range.start, range.end - depth + 1));
  return draftAtCell({ column, row }, shelf, { width, depth });
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

function activeRackMeasurement(shelf, level) {
  const measurement = appState.measurement;
  if (!measurement || measurement.shelfId !== shelf.id || measurement.level !== level) return null;
  return measurement;
}

function isRackMeasuring(shelf, level) {
  const measurement = activeRackMeasurement(shelf, level);
  return Boolean(measurement && measurement.active);
}

function clearRackMeasurement() {
  appState.measurement = null;
}

function toggleRackMeasurement(shelf, level) {
  if (isRackMeasuring(shelf, level)) {
    clearRackMeasurement();
    return;
  }
  appState.measurement = {
    active: true,
    shelfId: shelf.id,
    level,
    start: null,
    end: null
  };
}

function setRackMeasurePoint(shelf, level, point) {
  const measurement = activeRackMeasurement(shelf, level) || {
    active: true,
    shelfId: shelf.id,
    level,
    start: null,
    end: null
  };
  if (!measurement.start || measurement.end) {
    measurement.start = point;
    measurement.end = null;
  } else {
    measurement.end = point;
  }
  appState.measurement = measurement;
  return measurement;
}

function measureDistanceCm(measurement) {
  if (!measurement?.start || !measurement?.end) return 0;
  const dx = measurement.end.column - measurement.start.column;
  const dy = measurement.end.row - measurement.start.row;
  return Math.hypot(dx, dy);
}

function findFreeRackDraft(shelf, range, size) {
  const width = Math.min(size.width, range.width);
  const depth = Math.min(size.depth, range.height);
  const step = Math.max(1, Math.min(10, Math.round(Math.min(width, depth) / 4)));

  for (let row = range.start; row <= range.end - depth + 1; row += step) {
    for (let column = range.xStart; column <= range.xEnd - width + 1; column += step) {
      const draft = { row, column, width, depth };
      const collision = shelf.packages.some(item => rectsOverlap(draftRect(draft), packageRect(item)));
      if (!collision) return draft;
    }
  }

  const fallback = { row: range.start, column: range.xStart, width, depth };
  return shelf.packages.some(item => rectsOverlap(draftRect(fallback), packageRect(item))) ? null : fallback;
}

function totalFreeRun(shelves) {
  return shelves.reduce((sum, shelf) => sum + maxFreeRunCm(shelf), 0);
}

function isBlockedItem(item) {
  const text = `${item.package_name || ''} ${item.note || ''}`.toLowerCase();
  return text.includes('sperr') || text.includes('rot') || text.includes('verbot') || text.includes('nicht abstellen');
}

function isStackedItem(item) {
  return Number.parseInt(item.quantity, 10) > 1 || String(item.note || '').toLowerCase().includes('gestap');
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

function forbiddenRect(shelf) {
  const role = planRole(shelf);
  if (role === 'floor-main') {
    return {
      column: Math.max(1, shelf.columns - 80 + 1),
      row: 1,
      width: Math.min(80, shelf.columns),
      depth: Math.min(100, shelf.rows)
    };
  }
  if (role === 'floor-long') {
    return {
      column: 1,
      row: 1,
      width: Math.min(70, shelf.columns),
      depth: Math.min(380, shelf.rows)
    };
  }
  return null;
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
  const blocked = forbiddenRect(shelf);
  return Boolean(blocked && rectsOverlap(draftRect(draft), blocked));
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
  const adjusted = draftAtCell(
    { row: draft.row, column: draft.column },
    shelf,
    { width: draft.width, depth: draft.depth }
  );
  els.rowIndex.value = adjusted.row;
  els.columnIndex.value = adjusted.column;
  els.widthUnits.value = inputCm(adjusted.width);
  els.depthUnits.value = inputCm(adjusted.depth);
  appState.selected = { shelf, row: adjusted.row, column: adjusted.column };
  els.selectedCell.textContent = `${shelf.name}: ${formatSizeCm(adjusted.width, adjusted.depth)} gewählt`;
  return adjusted;
}

function setPackageEditFormValues(shelf, draft) {
  const adjusted = draftAtCell(
    { row: draft.row, column: draft.column },
    shelf,
    { width: draft.width, depth: draft.depth }
  );
  els.rowIndex.value = adjusted.row;
  els.columnIndex.value = adjusted.column;
  els.widthUnits.value = inputCm(adjusted.width);
  els.depthUnits.value = inputCm(adjusted.depth);
  appState.selected = { shelf, row: adjusted.row, column: adjusted.column };
  els.selectedCell.textContent = `${shelf.name}: Änderung bereit`;
  return adjusted;
}

function applyDraftSelection(shelf, draft) {
  if (!draft) {
    showMessage('In diesem Regalplatz ist kein freier Bereich für diese Größe.', 'error');
    return false;
  }
  if (touchesForbiddenArea(shelf, draft)) {
    showMessage('Diese Ecke ist gesperrt. Dort bitte nichts abstellen.', 'error');
    return false;
  }
  appState.selected = { shelf, row: draft.row, column: draft.column };
  els.packageId.value = '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputCm(shelf.rows);
  els.shelfColumns.value = inputCm(shelf.columns);
  setDraftFormValues(shelf, draft);
  if (!els.packageName.value.trim()) {
    els.packageName.value = 'Teil';
  }
  els.formTitle.textContent = 'Paket erfassen';
  els.saveButton.textContent = 'Paket speichern';
  els.deletePackageButton.classList.add('hidden');
  els.cancelEditButton.classList.add('hidden');
  showMessage(`${shelf.name}: Platz gewählt. Jetzt speichern.`);
  return true;
}

function selectCell(shelf, row, column, item) {
  appState.selected = { shelf, row, column };
  els.packageId.value = item ? item.id : '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputCm(shelf.rows);
  els.shelfColumns.value = inputCm(shelf.columns);
  els.rowIndex.value = row;
  els.columnIndex.value = column;
  els.widthUnits.value = item ? inputCm(item.width_units || 120) : 120;
  els.depthUnits.value = item ? inputCm(item.depth_units || 80) : 80;
  els.packageName.value = item ? item.package_name : '';
  els.quantity.value = item ? item.quantity : 1;
  els.note.value = item ? item.note || '' : '';
  els.formTitle.textContent = item ? 'Paket bearbeiten' : 'Paket erfassen';
  els.saveButton.textContent = item ? 'Änderung speichern' : 'Paket speichern';
  els.deletePackageButton.classList.toggle('hidden', !item);
  els.cancelEditButton.classList.toggle('hidden', !item);
  els.selectedCell.textContent = item
    ? `${shelf.name}: Bearbeitung aktiv`
    : `${shelf.name}: Platz gewählt`;
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
  els.formTitle.textContent = 'Paket erfassen';
  els.saveButton.textContent = 'Paket speichern';
  els.deletePackageButton.classList.add('hidden');
  els.cancelEditButton.classList.add('hidden');
}

function updateDraftFromSizeInputs(event) {
  if (event?.target) normalizeDecimalInput(event.target);
  if (!hasCompleteDecimalValue(els.widthUnits) || !hasCompleteDecimalValue(els.depthUnits)) return;
  const draft = selectedDraft();
  if (draft) {
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
  els.packagesTab.classList.toggle('active', view === 'packages');
  els.placesTab.classList.toggle('active', view === 'places');
  render();
}

function clearPlaceForm() {
  els.placeId.value = '';
  els.placeLocationType.value = 'shelf';
  els.placeName.value = '';
  els.placeRows.value = planPlaces.rack.rows;
  els.placeColumns.value = 600;
  els.placeNotes.value = '';
  els.savePlaceButton.textContent = 'Ort speichern';
  els.cancelPlaceButton.classList.add('hidden');
}

async function deletePackage(id) {
  await apiFetch(`/api/regale?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('Paket entfernt.');
  await loadShelves();
}

function render() {
  setAuthUi();
  els.shelves.innerHTML = '';
  els.overviewCards.innerHTML = '';
  els.warehouseMap.innerHTML = '';
  els.placeList.innerHTML = '';

  if (!appState.token) {
    els.summaryText.textContent = 'Bitte einloggen.';
    return;
  }

  const floorPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'floor');
  const shelfPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'shelf');
  const planShelves = selectedPlanShelves(shelfPlaces, floorPlaces);
  const oldPlaces = appState.shelves.filter(shelf => !planPlaceRole(shelf));
  const freeLength = totalFreeRun(planShelves);
  els.summaryText.textContent = planShelves.length
    ? `${formatCm(freeLength)} cm freie nutzbare Länge in den neuen 3 Orten.${oldPlaces.length ? ` ${oldPlaces.length} alter Ort ausgeblendet.` : ''}`
    : `Noch keine neuen 3 Orte angelegt.${oldPlaces.length ? ` ${oldPlaces.length} alter Ort ist unter Orte verwalten.` : ''}`;

  renderOverview(
    planShelves,
    shelfPlaces.filter(shelf => planPlaceRole(shelf) === 'rack'),
    floorPlaces.filter(shelf => planPlaceRole(shelf))
  );
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
    return isNearSize(shelf, 'rack') || text.includes('4 plätze') || text.includes('600 x 90') || text.includes('600 x 106')
      ? 'rack'
      : null;
  }
  if (text.includes('bodenplatz 2') || text.includes('380 x 740') || text.includes('390 x 740') || text.includes('70 x 380') || text.includes('380 x 70') || isNearSize(shelf, 'floor-long')) {
    return 'floor-long';
  }
  if (text.includes('bodenplatz 1') || text.includes('880 x 380') || text.includes('80 x 100') || isNearSize(shelf, 'floor-main')) {
    return 'floor-main';
  }
  return null;
}

function planRole(shelf) {
  return planPlaceRole(shelf) || 'other';
}

function planTitle(role) {
  return planPlaces[role]?.title || 'Lagerplatz';
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

function findPlanShelf(role, shelves) {
  return shelves.find(shelf => planPlaceRole(shelf) === role) || null;
}

function renderPlanDrawing(shelfPlaces, floorPlaces) {
  const all = [...shelfPlaces, ...floorPlaces];
  const plan = document.createElement('section');
  plan.className = 'plan-drawing';
  plan.append(renderPlanSlot('floor-main', findPlanShelf('floor-main', all)));
  plan.append(renderPlanSlot('rack', findPlanShelf('rack', all)));
  plan.append(renderPlanSlot('floor-long', findPlanShelf('floor-long', all)));
  els.shelves.append(plan);
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
      <span class="stat">${shelf ? lengthSummary(displayShelf) : 'noch nicht angelegt'}</span>
      ${role === 'rack' ? '<span class="stat">600 cm Länge, 90 cm Tiefe</span>' : ''}
    </div>
  `;
  slot.append(meta);

  if (shelf) {
    slot.append(role === 'rack' ? renderRackDisplay(displayShelf) : renderPlaceCanvas(displayShelf, kind, role));
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
  mark.textContent = 'Ort anlegen';
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
      <strong>${formatCm(rackLevelFreeRunCm(shelf, level))} cm frei</strong>
      <small>${range.heightLabel || `${packages.length} Positionen`}</small>
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
  const measurement = activeRackMeasurement(shelf, level);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `measure-toggle ${measurement?.active ? 'active' : ''}`;
  button.innerHTML = '<span class="measure-icon" aria-hidden="true"></span><span>Messen</span>';
  button.addEventListener('click', () => {
    toggleRackMeasurement(shelf, level);
    render();
  });
  tools.append(button);

  const label = document.createElement('span');
  label.className = 'measure-status';
  if (!measurement?.active) {
    label.textContent = 'Punkt 1, dann Punkt 2 messen';
  } else if (!measurement.start) {
    label.textContent = 'Punkt 1 wählen';
  } else if (!measurement.end) {
    label.textContent = 'Punkt 2 wählen';
  } else {
    label.textContent = `Gemessen: ${formatMeasureCm(measureDistanceCm(measurement))}`;
  }
  tools.append(label);
  return tools;
}

function renderRackLevelDetail(shelf, level) {
  const range = rackLevelRange(shelf, level);
  const canvas = document.createElement('div');
  const measurement = activeRackMeasurement(shelf, level);
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
    rectangle.classList.toggle('stacked-zone', isStackedItem(displayItem));
    rectangle.type = 'button';
    rectangle.style.left = `${((clippedLeft - range.xStart) / range.width) * 100}%`;
    rectangle.style.top = `${((clippedTop - range.start) / range.height) * 100}%`;
    rectangle.style.width = `${(visibleWidth / range.width) * 100}%`;
    rectangle.style.height = `${(visibleDepth / range.height) * 100}%`;
    rectangle.dataset.tooltip = item.package_name;
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
    empty.textContent = `${range.label} frei`;
    canvas.append(empty);
  }

  canvas.addEventListener('pointerdown', event => {
    if (isRackMeasuring(shelf, level)) {
      event.preventDefault();
      const point = canvasMeasurePointFromEvent(event, canvas, { ...shelf, columns: range.width, rows: range.height });
      setRackMeasurePoint(shelf, level, point);
      render();
      return;
    }
    if (event.target.closest('.package-rect, .draft-marker')) return;
    event.preventDefault();
    const cell = canvasCellFromEvent(event, canvas, { ...shelf, columns: range.width, rows: range.height });
    applyDraftSelection(shelf, draftInRackRange(shelf, range, cell, currentPackageSize()));
    render();
    els.packageName.focus();
  });

  return canvas;
}

function renderMeasureOverlay(measurement, range) {
  const overlay = document.createElement('div');
  overlay.className = 'measure-overlay';
  if (!measurement?.active || !measurement.start) return overlay;

  const start = measurement.start;
  const end = measurement.end || measurement.start;
  const x1 = (start.column / range.width) * 100;
  const y1 = (start.row / range.height) * 100;
  const x2 = (end.column / range.width) * 100;
  const y2 = (end.row / range.height) * 100;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const firstPoint = document.createElement('span');
  firstPoint.className = 'measure-point';
  firstPoint.style.left = `${x1}%`;
  firstPoint.style.top = `${y1}%`;
  overlay.append(firstPoint);

  if (measurement.end) {
    const secondPoint = document.createElement('span');
    secondPoint.className = 'measure-point end';
    secondPoint.style.left = `${x2}%`;
    secondPoint.style.top = `${y2}%`;
    overlay.append(secondPoint);

    const line = document.createElement('span');
    line.className = 'measure-line';
    line.style.left = `${x1}%`;
    line.style.top = `${y1}%`;
    line.style.width = `${length}%`;
    line.style.transform = `rotate(${angle}deg)`;
    overlay.append(line);

    const label = document.createElement('span');
    label.className = 'measure-label';
    label.style.left = `${(x1 + x2) / 2}%`;
    label.style.top = `${(y1 + y2) / 2}%`;
    label.textContent = formatMeasureCm(measureDistanceCm(measurement));
    overlay.append(label);
  }

  return overlay;
}

function renderPlaceCanvas(shelf, kind, role = planRole(shelf)) {
  const canvas = document.createElement('div');
  let dragStart = null;
  let dragDraft = null;
  let dragMarker = null;
  canvas.className = `place-canvas ${kind === 'floor' ? 'floor-canvas' : ''}`;
  canvas.style.setProperty('--cols', Math.max(1, Math.round(shelf.columns / (kind === 'shelf' ? 150 : 100))));
  canvas.style.setProperty('--rows', Math.max(1, Math.ceil(shelf.rows / 100)));
  canvas.style.aspectRatio = `${shelf.columns} / ${Math.max(1, shelf.rows)}`;
  canvas.append(renderDimensionLabels(shelf, kind, role));
  canvas.append(renderForbiddenArea(shelf, role));
  canvas.addEventListener('pointerdown', event => {
    if (event.target !== canvas) return;
    event.preventDefault();
    dragStart = canvasCellFromEvent(event, canvas, shelf);
    dragDraft = draftFromCorners(dragStart, dragStart, shelf);
    dragMarker = document.createElement('div');
    dragMarker.className = 'drag-marker';
    canvas.append(dragMarker);
    canvas.setPointerCapture(event.pointerId);
    updateDragMarker(shelf, dragMarker, dragDraft);
  });

  canvas.addEventListener('pointermove', event => {
    if (!dragDraft || !dragMarker) return;
    dragDraft = draftFromCorners(dragStart, canvasCellFromEvent(event, canvas, shelf), shelf);
    updateDragMarker(shelf, dragMarker, dragDraft);
  });

  canvas.addEventListener('pointerup', event => {
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

  shelf.packages.forEach(item => {
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
    rectangle.classList.toggle('stacked-zone', isStackedItem(displayItem));
    rectangle.type = 'button';
    rectangle.style.left = `${((displayItem.column_index - 1) / shelf.columns) * 100}%`;
    rectangle.style.top = `${((displayItem.row_index - 1) / shelf.rows) * 100}%`;
    rectangle.style.width = `${((displayItem.width_units || 1) / shelf.columns) * 100}%`;
    rectangle.style.height = `${((displayItem.depth_units || 1) / shelf.rows) * 100}%`;
    rectangle.dataset.tooltip = item.package_name;
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
    empty.textContent = 'Freie Fläche';
    canvas.append(empty);
  }

  return canvas;
}

function renderForbiddenArea(shelf, role) {
  const area = document.createElement('div');
  area.className = 'forbidden-area hidden';
  if (role === 'floor-main') {
    area.classList.remove('hidden');
    area.style.left = `${((shelf.columns - 80) / shelf.columns) * 100}%`;
    area.style.top = '0';
    area.style.width = `${(80 / shelf.columns) * 100}%`;
    area.style.height = `${(100 / shelf.rows) * 100}%`;
  }
  if (role === 'floor-long') {
    area.classList.remove('hidden');
    area.style.left = '0';
    area.style.top = '0';
    area.style.width = `${(70 / shelf.columns) * 100}%`;
    area.style.height = `${(380 / shelf.rows) * 100}%`;
  }
  return area;
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
    ${kind === 'shelf' ? '<span class="dim dim-bays">600 cm</span>' : ''}
    ${role === 'floor-main' ? '<span class="dim dim-blocked">80 x 100 cm Sperrfläche</span>' : ''}
    ${role === 'floor-long' ? '<span class="dim dim-blocked">70 x 380 cm Sperrfläche</span>' : ''}
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
  const payload = {
    packageId: item.id,
    locationType: placeKind(shelf),
    shelfName: shelf.name,
    shelfRows: cmInputToMeters(shelf.rows, shelf.rows),
    shelfColumns: cmInputToMeters(shelf.columns, shelf.columns),
    rowIndex: draft.row,
    columnIndex: draft.column,
    widthUnits: cmInputToMeters(item.width_units || 1, item.width_units || 1),
    depthUnits: cmInputToMeters(item.depth_units || 1, item.depth_units || 1),
    packageName: item.package_name,
    quantity: item.quantity,
    note: item.note || ''
  };
  await apiFetch('/api/regale', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  showMessage('Paket verschoben.');
  await loadShelves();
}

function renderPlaces() {
  const planPlacesList = appState.shelves.filter(planPlaceRole);
  const oldPlaces = appState.shelves.filter(place => !planPlaceRole(place));
  if (planPlacesList.length) {
    renderPlaceGroup('Aktuelle 3 Orte', planPlacesList);
  }
  if (oldPlaces.length) {
    renderPlaceGroup('Alte/sonstige Orte', oldPlaces, true);
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
        <button class="ghost edit-place" type="button">Bearbeiten</button>
        <button class="ghost delete-place" type="button">Löschen</button>
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
  els.savePlaceButton.textContent = 'Ort aktualisieren';
  els.cancelPlaceButton.classList.remove('hidden');
}

function renderOverview(shelves, shelfPlaces, floorPlaces) {
  const freeLength = totalFreeRun(shelves);
  const blockedCount = shelves.reduce((sum, shelf) => sum + shelf.packages.filter(isBlockedItem).length, 0);
  const stackedCount = shelves.reduce((sum, shelf) => sum + shelf.packages.filter(isStackedItem).length, 0);
  const cards = [
    ['Freie Länge', `${formatCm(freeLength)} cm`, 'längste freie Strecken addiert'],
    ['Sperrflächen', blockedCount, 'rot markiert, nicht abstellen'],
    ['Regal', shelfPlaces.length, '4 Plätze à 150 x 90 cm'],
    ['Bodenflächen', floorPlaces.length, 'normale Stellflächen']
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
    els.summaryText.textContent += ` ${stackedCount} gestapelte Positionen markiert.`;
  }
}

function renderWarehouseMap(shelfPlaces, floorPlaces) {
  const zones = [
    ['Regal 600 x 90', shelfPlaces],
    ['Bodenplatz 1', floorPlaces.slice(0, 1)],
    ['Bodenplatz 2', floorPlaces.slice(1)]
  ];

  zones.forEach(([label, places]) => {
    const zone = document.createElement('button');
    zone.className = `map-zone ${places.length ? '' : 'empty-zone'}`;
    zone.type = 'button';
    const free = totalFreeRun(places);
    const total = places.reduce((sum, shelf) => sum + (shelf.columns || 0), 0);
    const usedPercent = total ? Math.round(((total - free) / total) * 100) : 0;
    zone.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${places.length ? `${formatCm(free)} cm freie Länge` : 'noch frei planbar'}</strong>
      <i class="zone-meter" aria-hidden="true"><b style="width: ${usedPercent}%"></b></i>
    `;
    els.warehouseMap.append(zone);
  });
}

function setupPresetButton(button) {
  const [width, depth, height, name] = button.dataset.preset.split('|');
  const presetWidth = cmInputToCm(width, 100);
  const presetDepth = cmInputToCm(depth, 100);
  const scale = Math.max(presetWidth, presetDepth, 1);
  const visualWidth = clamp((presetWidth / scale) * 100, 16, 100);
  const visualDepth = clamp((presetDepth / scale) * 100, 14, 100);
  const isBlocked = String(name || '').toLowerCase().includes('sperr');
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
  return `
    <span class="measure">${formatSizeCm(item.width_units || 1, item.depth_units || 1)}</span>
    <span class="pkg">${escapeHtml(item.package_name)}</span>
    <span class="note">${escapeHtml(item.quantity)}x ${isStackedItem(item) ? 'gestapelt ' : ''}${escapeHtml(item.note || '')}</span>
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
  normalizeDecimalFields(els.shelfRows, els.shelfColumns, els.widthUnits, els.depthUnits);
  updateDraftFromSizeInputs();
  const payload = Object.fromEntries(new FormData(els.packageForm).entries());
  const selectedShelf = appState.selected?.shelf;
  if (selectedShelf && touchesForbiddenArea(selectedShelf, {
    row: cmInputToCm(payload.rowIndex, 1),
    column: cmInputToCm(payload.columnIndex, 1),
    width: cmInputToCm(payload.widthUnits, 100),
    depth: cmInputToCm(payload.depthUnits, 100)
  })) {
    showMessage('Diese Ecke ist gesperrt. Dort bitte nichts abstellen.', 'error');
    return;
  }
  payload.shelfRows = cmInputToMeters(payload.shelfRows, planPlaces.rack.rows);
  payload.shelfColumns = cmInputToMeters(payload.shelfColumns, 600);
  payload.widthUnits = cmInputToMeters(payload.widthUnits, 100);
  payload.depthUnits = cmInputToMeters(payload.depthUnits, 100);
  if (payload.locationType === 'floor' && !String(payload.shelfName || '').toLowerCase().includes('boden')) {
    payload.shelfName = `Boden - ${payload.shelfName}`;
  }
  const isEdit = Boolean(payload.packageId);
  await apiFetch('/api/regale', {
    method: isEdit ? 'PATCH' : 'POST',
    body: JSON.stringify(payload)
  });
  clearPackageForm();
  showMessage(isEdit ? 'Paket verschoben/aktualisiert.' : 'Paket gespeichert.');
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
  showMessage(isEdit ? 'Ort aktualisiert.' : 'Ort angelegt.');
  await loadShelves();
}

async function deletePlace(id) {
  await apiFetch(`/api/places?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('Ort gelöscht.');
  await loadShelves();
}

async function deleteAllPlaces() {
  const ok = window.confirm('Alle Pakete und alle Flächen wirklich löschen?');
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
  showMessage('Alle Flächen gelöscht.');
  await loadShelves();
}

async function createDefaultPlanPlaces() {
  const existingRoles = new Set(appState.shelves.map(planPlaceRole).filter(Boolean));
  const missingRoles = ['floor-main', 'rack', 'floor-long'].filter(role => !existingRoles.has(role));
  if (!missingRoles.length) {
    showMessage('Die 3 Orte sind schon angelegt.');
    return;
  }

  for (const role of missingRoles) {
    await apiFetch('/api/places', {
      method: 'POST',
      body: JSON.stringify(defaultPlacePayload(role))
    });
  }
  showMessage(`${missingRoles.length} Ort(e) angelegt.`);
  await loadShelves();
}

async function createPlanPlace(role) {
  const existing = appState.shelves.find(shelf => planPlaceRole(shelf) === role);
  if (existing) {
    showMessage(`${existing.name} ist schon angelegt.`);
    return;
  }
  await apiFetch('/api/places', {
    method: 'POST',
    body: JSON.stringify(defaultPlacePayload(role))
  });
  showMessage(`${planTitle(role)} angelegt.`);
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
  showMessage('Login erfolgreich.');
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

els.defaultPlanButton.addEventListener('click', () => {
  createDefaultPlanPlaces().catch(error => showMessage(error.message, 'error'));
});

els.packagesTab.addEventListener('click', () => setActiveView('packages'));
els.placesTab.addEventListener('click', () => setActiveView('places'));

els.packageForm.addEventListener('submit', event => {
  submitPackage(event).catch(error => showMessage(error.message, 'error'));
});

els.placeForm.addEventListener('submit', event => {
  submitPlace(event).catch(error => showMessage(error.message, 'error'));
});

els.cancelEditButton.addEventListener('click', () => {
  clearPackageForm();
  els.selectedCell.textContent = 'Keine Fläche gewählt';
  render();
});

els.deletePackageButton.addEventListener('click', async () => {
  if (!els.packageId.value) return;
  await deletePackage(els.packageId.value).catch(error => showMessage(error.message, 'error'));
  clearPackageForm();
  els.selectedCell.textContent = 'Keine Fläche gewählt';
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
    els.packageName.value = name;
    els.quantity.value = quantity;
    els.note.value = height && height !== '0'
      ? `${note ? `${note}, ` : ''}Höhe ${height} cm`
      : note;
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
    els.savePlaceButton.textContent = 'Ort speichern';
    els.cancelPlaceButton.classList.add('hidden');
  });
});

[els.shelfRows, els.shelfColumns, els.widthUnits, els.depthUnits, els.placeRows, els.placeColumns].forEach(input => {
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
