const tokenKey = 'freespace_token';
const els = {
  loginForm: document.querySelector('#loginForm'),
  logoutButton: document.querySelector('#logoutButton'),
  refreshButton: document.querySelector('#refreshButton'),
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
  activeView: 'packages'
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
  appState.selected = { shelf, row: draft.row, column: draft.column };
  els.packageId.value = '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputCm(shelf.rows);
  els.shelfColumns.value = inputCm(shelf.columns);
  setDraftFormValues(shelf, draft);
  els.formTitle.textContent = 'Paket erfassen';
  els.saveButton.textContent = 'Paket speichern';
  els.deletePackageButton.classList.add('hidden');
  els.cancelEditButton.classList.add('hidden');
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
  els.placeRows.value = 245;
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
  const freeLength = totalFreeRun(appState.shelves);
  els.summaryText.textContent = appState.shelves.length
    ? `${formatCm(freeLength)} cm freie nutzbare Länge über alle Flächen.`
    : 'Noch keine Regale angelegt.';

  renderOverview(appState.shelves, shelfPlaces, floorPlaces);
  renderWarehouseMap(shelfPlaces, floorPlaces);
  renderPlaces();

  appState.shelves.forEach(shelf => {
    const section = document.createElement('section');
    const kind = placeKind(shelf);
    section.className = `shelf ${kind === 'floor' ? 'floor-place' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'shelf-meta';
    meta.innerHTML = `
      <div>
        <span class="place-type">${placeLabel(kind)}</span>
        <h2>${escapeHtml(shelf.label || shelf.name)}</h2>
      </div>
      <div class="stats">
        <span class="stat">${lengthSummary(shelf)}</span>
        <span class="stat">${formatCm(shelf.columns)} x ${formatCm(shelf.rows)} cm</span>
        ${placeKind(shelf) === 'shelf' ? '<span class="stat">4 Felder à 150 cm</span>' : ''}
      </div>
    `;
    section.append(meta);

    section.append(renderPlaceCanvas(shelf, kind));
    els.shelves.append(section);
  });
}

function renderPlaceCanvas(shelf, kind) {
  const canvas = document.createElement('div');
  let dragStart = null;
  let dragDraft = null;
  let dragMarker = null;
  canvas.className = `place-canvas ${kind === 'floor' ? 'floor-canvas' : ''}`;
  canvas.style.setProperty('--cols', Math.max(1, Math.round(shelf.columns / (kind === 'shelf' ? 150 : 100))));
  canvas.style.setProperty('--rows', Math.max(1, Math.ceil(shelf.rows / 100)));
  canvas.style.aspectRatio = `${shelf.columns} / ${Math.max(1, shelf.rows)}`;
  canvas.append(renderDimensionLabels(shelf, kind));
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

function updateDragMarker(shelf, marker, draft) {
  marker.style.left = `${((draft.column - 1) / shelf.columns) * 100}%`;
  marker.style.top = `${((draft.row - 1) / shelf.rows) * 100}%`;
  marker.style.width = `${(draft.width / shelf.columns) * 100}%`;
  marker.style.height = `${(draft.depth / shelf.rows) * 100}%`;
}

function renderDimensionLabels(shelf, kind) {
  const labels = document.createElement('div');
  labels.className = 'dimension-labels';
  labels.innerHTML = `
    <span class="dim dim-top">${formatCm(shelf.columns)} cm</span>
    <span class="dim dim-left">${formatCm(shelf.rows)} cm</span>
    ${kind === 'shelf' ? '<span class="dim dim-bays">150 + 150 + 150 + 150 cm</span>' : ''}
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
  appState.shelves.forEach(place => {
    const kind = placeKind(place);
    const item = document.createElement('article');
    item.className = `place-item ${kind === 'floor' ? 'floor-place-item' : ''}`;
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
    els.placeList.append(item);
  });
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
    ['Regal', shelfPlaces.length, '4 Felder à 150 cm'],
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
    ['Regal 600 cm', shelfPlaces],
    ['Bodenfläche 1', floorPlaces.slice(0, 1)],
    ['Bodenfläche 2', floorPlaces.slice(1)]
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
  payload.shelfRows = cmInputToMeters(payload.shelfRows, 245);
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
  payload.rows = cmInputToMeters(payload.rows, 245);
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

document.querySelectorAll('[data-preset]').forEach(button => {
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
