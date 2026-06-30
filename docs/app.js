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

function metersToCm(value, fallbackMeters = 1) {
  return Math.max(1, Math.round(Math.max(0.01, numberValue(value, fallbackMeters)) * 100));
}

function cmToMeters(cm) {
  return (Math.max(1, Number.parseInt(cm, 10) || 1) / 100);
}

function formatMeters(cm) {
  return cmToMeters(cm).toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function inputMeters(cm) {
  return cmToMeters(cm).toFixed(2).replace(/\.?0+$/, '');
}

function formatSquareMeters(cm2) {
  return (Math.max(0, cm2 || 0) / 10000).toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
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
    width: metersToCm(els.widthUnits.value, 1),
    depth: metersToCm(els.depthUnits.value, 1)
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

function applyDraftSelection(shelf, draft) {
  appState.selected = null;
  els.packageId.value = '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputMeters(shelf.rows);
  els.shelfColumns.value = inputMeters(shelf.columns);
  els.rowIndex.value = draft.row;
  els.columnIndex.value = draft.column;
  els.widthUnits.value = inputMeters(draft.width);
  els.depthUnits.value = inputMeters(draft.depth);
  els.formTitle.textContent = 'Paket erfassen';
  els.saveButton.textContent = 'Paket speichern';
  els.cancelEditButton.classList.add('hidden');
  els.selectedCell.textContent = `${shelf.name}: ${formatMeters(draft.width)} x ${formatMeters(draft.depth)} m gewählt`;
}

function selectCell(shelf, row, column, item) {
  appState.selected = { shelf, row, column };
  els.packageId.value = item ? item.id : '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = inputMeters(shelf.rows);
  els.shelfColumns.value = inputMeters(shelf.columns);
  els.rowIndex.value = row;
  els.columnIndex.value = column;
  els.widthUnits.value = item ? inputMeters(item.width_units || 1) : 1;
  els.depthUnits.value = item ? inputMeters(item.depth_units || 1) : 1;
  els.packageName.value = item ? item.package_name : '';
  els.quantity.value = item ? item.quantity : 1;
  els.note.value = item ? item.note || '' : '';
  els.formTitle.textContent = item ? 'Paket bearbeiten' : 'Paket erfassen';
  els.saveButton.textContent = item ? 'Änderung speichern' : 'Paket speichern';
  els.cancelEditButton.classList.toggle('hidden', !item);
  els.selectedCell.textContent = item
    ? `${shelf.name}: ${formatMeters(item.width_units || 1)} x ${formatMeters(item.depth_units || 1)} m`
    : `${shelf.name}: Platz gewählt`;
  if (!item) els.packageName.focus();
  render();
}

function clearPackageForm() {
  els.packageId.value = '';
  els.packageName.value = '';
  els.quantity.value = 1;
  els.note.value = '';
  els.widthUnits.value = 1;
  els.depthUnits.value = 1;
  els.formTitle.textContent = 'Paket erfassen';
  els.saveButton.textContent = 'Paket speichern';
  els.cancelEditButton.classList.add('hidden');
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
  els.placeRows.value = 4;
  els.placeColumns.value = 8;
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

  const total = appState.shelves.reduce((sum, shelf) => sum + shelf.totalPlaces, 0);
  const free = appState.shelves.reduce((sum, shelf) => sum + shelf.freePlaces, 0);
  const floorPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'floor');
  const shelfPlaces = appState.shelves.filter(shelf => placeKind(shelf) === 'shelf');
  els.summaryText.textContent = appState.shelves.length
    ? `${formatSquareMeters(free)} von ${formatSquareMeters(total)} m² frei.`
    : 'Noch keine Regale angelegt.';

  renderOverview(total, free, shelfPlaces, floorPlaces);
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
        <span class="stat">${formatSquareMeters(shelf.freePlaces)} m² frei</span>
        <span class="stat">${formatSquareMeters(shelf.usedPlaces)} m² belegt</span>
        <span class="stat">${formatMeters(shelf.columns)} x ${formatMeters(shelf.rows)} m</span>
      </div>
    `;
    section.append(meta);

    section.append(renderPlaceCanvas(shelf, kind));
    els.shelves.append(section);
  });
}

function renderPlaceCanvas(shelf, kind) {
  const canvas = document.createElement('div');
  let dragDraft = null;
  let dragMarker = null;
  canvas.className = `place-canvas ${kind === 'floor' ? 'floor-canvas' : ''}`;
  canvas.style.setProperty('--cols', Math.max(1, Math.ceil(shelf.columns / 100)));
  canvas.style.setProperty('--rows', Math.max(1, Math.ceil(shelf.rows / 100)));
  canvas.style.aspectRatio = `${shelf.columns} / ${Math.max(1, shelf.rows)}`;
  canvas.addEventListener('pointerdown', event => {
    if (event.target !== canvas) return;
    event.preventDefault();
    dragDraft = draftAtCell(canvasCellFromEvent(event, canvas, shelf), shelf, currentPackageSize());
    dragMarker = document.createElement('div');
    dragMarker.className = 'drag-marker';
    canvas.append(dragMarker);
    canvas.setPointerCapture(event.pointerId);
    updateDragMarker(shelf, dragMarker, dragDraft);
  });

  canvas.addEventListener('pointermove', event => {
    if (!dragDraft || !dragMarker) return;
    dragDraft = draftAtCell(canvasCellFromEvent(event, canvas, shelf), shelf, currentPackageSize());
    updateDragMarker(shelf, dragMarker, dragDraft);
  });

  canvas.addEventListener('pointerup', event => {
    if (!dragDraft || !dragMarker) return;
    const draft = dragDraft;
    dragMarker.remove();
    dragDraft = null;
    dragMarker = null;
    applyDraftSelection(shelf, draft);
    render();
    els.packageName.focus();
  });

  canvas.addEventListener('pointercancel', () => {
    if (dragMarker) dragMarker.remove();
    dragDraft = null;
    dragMarker = null;
  });

  shelf.packages.forEach(item => {
    const rectangle = document.createElement('button');
    const selectedPackage = els.packageId.value === item.id;
    rectangle.className = `package-rect ${selectedPackage ? 'selected' : ''}`;
    rectangle.type = 'button';
    rectangle.style.left = `${((item.column_index - 1) / shelf.columns) * 100}%`;
    rectangle.style.top = `${((item.row_index - 1) / shelf.rows) * 100}%`;
    rectangle.style.width = `${((item.width_units || 1) / shelf.columns) * 100}%`;
    rectangle.style.height = `${((item.depth_units || 1) / shelf.rows) * 100}%`;
    rectangle.dataset.tooltip = item.package_name;
    rectangle.setAttribute('aria-label', item.package_name);
    rectangle.innerHTML = packageHtml(item);
    rectangle.addEventListener('pointerdown', event => {
      if (event.target.closest('.delete')) return;
      startPackageMove(event, canvas, shelf, item, rectangle);
    });
    rectangle.addEventListener('click', event => {
      if (event.target.closest('.delete')) return;
      if (rectangle.dataset.dragged === 'true') {
        rectangle.dataset.dragged = 'false';
        return;
      }
      selectCell(shelf, item.row_index, item.column_index, item);
    });
    rectangle.querySelector('.delete').addEventListener('click', event => {
      event.stopPropagation();
      deletePackage(item.id).catch(error => showMessage(error.message, 'error'));
    });
    canvas.append(rectangle);
  });

  if (!shelf.packages.length) {
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

function startPackageMove(event, canvas, shelf, item, rectangle) {
  event.preventDefault();
  event.stopPropagation();
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
    shelfRows: inputMeters(shelf.rows),
    shelfColumns: inputMeters(shelf.columns),
    rowIndex: draft.row,
    columnIndex: draft.column,
    widthUnits: inputMeters(item.width_units || 1),
    depthUnits: inputMeters(item.depth_units || 1),
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
        <p>${formatMeters(place.columns)} x ${formatMeters(place.rows)} m · ${formatSquareMeters(place.freePlaces)} m² frei</p>
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
  els.placeRows.value = inputMeters(place.rows);
  els.placeColumns.value = inputMeters(place.columns);
  els.placeNotes.value = place.notes || '';
  els.savePlaceButton.textContent = 'Ort aktualisieren';
  els.cancelPlaceButton.classList.remove('hidden');
}

function renderOverview(total, free, shelfPlaces, floorPlaces) {
  const used = total - free;
  const cards = [
    ['Freie Fläche', free, `${formatSquareMeters(total)} m² insgesamt`],
    ['Belegt', used, `${total ? Math.round((used / total) * 100) : 0}% genutzt`],
    ['Regale', shelfPlaces.length, 'vertikale Bereiche'],
    ['Bodenplätze', floorPlaces.length, 'freie Stellflächen']
  ];

  cards.forEach(([label, value, hint]) => {
    const card = document.createElement('div');
    card.className = 'overview-card';
    card.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${label.includes('Fläche') || label === 'Belegt' ? `${formatSquareMeters(value)} m²` : escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    `;
    els.overviewCards.append(card);
  });
}

function renderWarehouseMap(shelfPlaces, floorPlaces) {
  const zones = [
    ['Regalwand', shelfPlaces],
    ['Boden Mitte', floorPlaces.filter(shelf => String(shelf.name).toLowerCase().includes('mitte'))],
    ['Wareneingang/Ausgang', floorPlaces.filter(shelf => !String(shelf.name).toLowerCase().includes('mitte'))]
  ];

  zones.forEach(([label, places]) => {
    const zone = document.createElement('button');
    zone.className = `map-zone ${places.length ? '' : 'empty-zone'}`;
    zone.type = 'button';
    const free = places.reduce((sum, shelf) => sum + shelf.freePlaces, 0);
    const total = places.reduce((sum, shelf) => sum + shelf.totalPlaces, 0);
    const usedPercent = total ? Math.round(((total - free) / total) * 100) : 0;
    zone.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${places.length ? `${formatSquareMeters(free)}/${formatSquareMeters(total)} m² frei` : 'noch frei planbar'}</strong>
      <i class="zone-meter" aria-hidden="true"><b style="width: ${usedPercent}%"></b></i>
    `;
    els.warehouseMap.append(zone);
  });
}

function packageHtml(item) {
  return `
    <span class="measure">${formatMeters(item.width_units || 1)} x ${formatMeters(item.depth_units || 1)} m</span>
    <span class="pkg">${escapeHtml(item.package_name)}</span>
    <span class="note">${escapeHtml(item.quantity)}x ${escapeHtml(item.note || '')}</span>
    <span class="delete" role="button" aria-label="Paket entfernen">Entfernen</span>
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
  const payload = Object.fromEntries(new FormData(els.packageForm).entries());
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
  const payload = Object.fromEntries(new FormData(els.placeForm).entries());
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
  appState.selected = null;
  els.selectedCell.textContent = 'Keine Fläche gewählt';
  render();
});

els.cancelPlaceButton.addEventListener('click', clearPlaceForm);

document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    const [place, type, rows, columns, row, column, width, depth, name, quantity, note] = button.dataset.example.split('|');
    els.packageId.value = '';
    els.locationType.value = type;
    els.shelfName.value = place;
    els.shelfRows.value = rows;
    els.shelfColumns.value = columns;
    els.rowIndex.value = row;
    els.columnIndex.value = column;
    els.widthUnits.value = width;
    els.depthUnits.value = depth;
    els.packageName.value = name;
    els.quantity.value = quantity;
    els.note.value = note;
    els.selectedCell.textContent = `${place}: ${width} x ${depth} m`;
  });
});

render();
loadShelves().catch(error => {
  showMessage(error.message, 'error');
  render();
});
