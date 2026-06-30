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

function selectCell(shelf, row, column, item) {
  appState.selected = { shelf, row, column };
  els.packageId.value = item ? item.id : '';
  els.locationType.value = placeKind(shelf);
  els.shelfName.value = shelf.name;
  els.shelfRows.value = shelf.rows;
  els.shelfColumns.value = shelf.columns;
  els.rowIndex.value = row;
  els.columnIndex.value = column;
  els.widthUnits.value = item ? item.width_units || 1 : 1;
  els.depthUnits.value = item ? item.depth_units || 1 : 1;
  els.packageName.value = item ? item.package_name : '';
  els.quantity.value = item ? item.quantity : 1;
  els.note.value = item ? item.note || '' : '';
  els.formTitle.textContent = item ? 'Paket bearbeiten' : 'Paket hinzufügen';
  els.saveButton.textContent = item ? 'Änderung speichern' : 'Speichern';
  els.cancelEditButton.classList.toggle('hidden', !item);
  els.selectedCell.textContent = `${shelf.name}: X ${column}, Y ${row}`;
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
  els.formTitle.textContent = 'Paket hinzufügen';
  els.saveButton.textContent = 'Speichern';
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
    ? `${free} von ${total} Plätzen frei.`
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
        <span class="stat">${shelf.freePlaces} frei</span>
        <span class="stat">${shelf.usedPlaces} belegt</span>
        <span class="stat">${shelf.rows} x ${shelf.columns}</span>
      </div>
    `;
    section.append(meta);

    section.append(renderPlaceCanvas(shelf, kind));
    els.shelves.append(section);
  });
}

function renderPlaceCanvas(shelf, kind) {
  const canvas = document.createElement('div');
  canvas.className = `place-canvas ${kind === 'floor' ? 'floor-canvas' : ''}`;
  canvas.style.setProperty('--cols', shelf.columns);
  canvas.style.setProperty('--rows', shelf.rows);
  canvas.style.aspectRatio = `${shelf.columns} / ${Math.max(1, shelf.rows)}`;
  canvas.addEventListener('click', event => {
    if (event.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Number.parseInt(els.widthUnits.value, 10) || 1;
    const depth = Number.parseInt(els.depthUnits.value, 10) || 1;
    const column = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * shelf.columns) + 1, 1, Math.max(1, shelf.columns - width + 1));
    const row = clamp(Math.floor(((event.clientY - rect.top) / rect.height) * shelf.rows) + 1, 1, Math.max(1, shelf.rows - depth + 1));
    selectCell(shelf, row, column, null);
  });

  const selected = appState.selected && appState.selected.shelf.id === shelf.id && !els.packageId.value;
  if (selected) {
    const marker = document.createElement('div');
    marker.className = 'free-marker';
    marker.style.left = `${((appState.selected.column - 1) / shelf.columns) * 100}%`;
    marker.style.top = `${((appState.selected.row - 1) / shelf.rows) * 100}%`;
    marker.style.width = `${((Number.parseInt(els.widthUnits.value, 10) || 1) / shelf.columns) * 100}%`;
    marker.style.height = `${((Number.parseInt(els.depthUnits.value, 10) || 1) / shelf.rows) * 100}%`;
    canvas.append(marker);
  }

  shelf.packages.forEach(item => {
    const rectangle = document.createElement('button');
    const selectedPackage = els.packageId.value === item.id;
    rectangle.className = `package-rect ${selectedPackage ? 'selected' : ''}`;
    rectangle.type = 'button';
    rectangle.style.left = `${((item.column_index - 1) / shelf.columns) * 100}%`;
    rectangle.style.top = `${((item.row_index - 1) / shelf.rows) * 100}%`;
    rectangle.style.width = `${((item.width_units || 1) / shelf.columns) * 100}%`;
    rectangle.style.height = `${((item.depth_units || 1) / shelf.rows) * 100}%`;
    rectangle.innerHTML = packageHtml(item);
    rectangle.addEventListener('click', event => {
      if (event.target.closest('.delete')) return;
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

function renderPlaces() {
  appState.shelves.forEach(place => {
    const kind = placeKind(place);
    const item = document.createElement('article');
    item.className = `place-item ${kind === 'floor' ? 'floor-place-item' : ''}`;
    item.innerHTML = `
      <div>
        <span class="place-type">${placeLabel(kind)}</span>
        <h3>${escapeHtml(place.label || place.name)}</h3>
        <p>${escapeHtml(place.rows)} Reihen/Zonen · ${escapeHtml(place.columns)} Plätze · ${escapeHtml(place.freePlaces)} frei</p>
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
  els.placeRows.value = place.rows;
  els.placeColumns.value = place.columns;
  els.placeNotes.value = place.notes || '';
  els.savePlaceButton.textContent = 'Ort aktualisieren';
  els.cancelPlaceButton.classList.remove('hidden');
}

function renderOverview(total, free, shelfPlaces, floorPlaces) {
  const used = total - free;
  const cards = [
    ['Gesamt frei', free, `${total} Plätze insgesamt`],
    ['Belegt', used, 'eingetragene Packungen'],
    ['Regale', shelfPlaces.length, 'normale Regalbereiche'],
    ['Bodenplätze', floorPlaces.length, 'für große/lose Sachen']
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
    zone.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${places.length ? `${free}/${total} frei` : 'noch frei planbar'}</strong>
    `;
    els.warehouseMap.append(zone);
  });
}

function packageHtml(item) {
  return `
    <span class="pos">X${escapeHtml(item.column_index)} / Y${escapeHtml(item.row_index)}</span>
    <span class="pkg">${escapeHtml(item.package_name)}</span>
    <span class="note">${escapeHtml(item.quantity)}x · ${escapeHtml(item.width_units || 1)} x ${escapeHtml(item.depth_units || 1)}</span>
    <span class="note">${escapeHtml(item.note || '')}</span>
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
  els.selectedCell.textContent = 'Kein Platz gewählt';
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
    els.selectedCell.textContent = `${place}: X ${column}, Y ${row}`;
  });
});

render();
loadShelves().catch(error => {
  showMessage(error.message, 'error');
  render();
});
