const tokenKey = 'freespace_token';
const els = {
  loginForm: document.querySelector('#loginForm'),
  logoutButton: document.querySelector('#logoutButton'),
  refreshButton: document.querySelector('#refreshButton'),
  userLabel: document.querySelector('#userLabel'),
  setupPanel: document.querySelector('#setupPanel'),
  message: document.querySelector('#message'),
  loginView: document.querySelector('#loginView'),
  appView: document.querySelector('#appView'),
  shelves: document.querySelector('#shelves'),
  summaryText: document.querySelector('#summaryText'),
  packageForm: document.querySelector('#packageForm'),
  selectedCell: document.querySelector('#selectedCell'),
  shelfName: document.querySelector('#shelfName'),
  shelfRows: document.querySelector('#shelfRows'),
  shelfColumns: document.querySelector('#shelfColumns'),
  rowIndex: document.querySelector('#rowIndex'),
  columnIndex: document.querySelector('#columnIndex'),
  packageName: document.querySelector('#packageName'),
  quantity: document.querySelector('#quantity'),
  note: document.querySelector('#note')
};

let appState = {
  token: localStorage.getItem(tokenKey) || '',
  user: null,
  shelves: [],
  selected: null
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

function packageAt(shelf, row, column) {
  return shelf.packages.find(item => item.row_index === row && item.column_index === column);
}

function selectCell(shelf, row, column, item) {
  appState.selected = { shelf, row, column };
  els.shelfName.value = shelf.name;
  els.shelfRows.value = shelf.rows;
  els.shelfColumns.value = shelf.columns;
  els.rowIndex.value = row;
  els.columnIndex.value = column;
  els.selectedCell.textContent = `${shelf.name}: Reihe ${row}, Platz ${column}`;
  if (!item) els.packageName.focus();
  render();
}

async function deletePackage(id) {
  await apiFetch(`/api/regale?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('Paket entfernt.');
  await loadShelves();
}

function render() {
  setAuthUi();
  els.shelves.innerHTML = '';

  if (!appState.token) {
    els.summaryText.textContent = 'Bitte einloggen.';
    return;
  }

  const total = appState.shelves.reduce((sum, shelf) => sum + shelf.totalPlaces, 0);
  const free = appState.shelves.reduce((sum, shelf) => sum + shelf.freePlaces, 0);
  els.summaryText.textContent = appState.shelves.length
    ? `${free} von ${total} Plätzen frei.`
    : 'Noch keine Regale angelegt.';

  appState.shelves.forEach(shelf => {
    const section = document.createElement('section');
    section.className = 'shelf';

    const meta = document.createElement('div');
    meta.className = 'shelf-meta';
    meta.innerHTML = `
      <h2>${escapeHtml(shelf.label || shelf.name)}</h2>
      <div class="stats">
        <span class="stat">${shelf.freePlaces} frei</span>
        <span class="stat">${shelf.usedPlaces} belegt</span>
        <span class="stat">${shelf.rows} x ${shelf.columns}</span>
      </div>
    `;
    section.append(meta);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.gridTemplateColumns = `repeat(${shelf.columns}, minmax(72px, 1fr))`;

    for (let row = 1; row <= shelf.rows; row += 1) {
      for (let column = 1; column <= shelf.columns; column += 1) {
        const item = packageAt(shelf, row, column);
        const button = document.createElement('button');
        const selected = appState.selected
          && appState.selected.shelf.id === shelf.id
          && appState.selected.row === row
          && appState.selected.column === column;
        button.className = `cell ${item ? 'busy' : ''} ${selected ? 'selected' : ''}`;
        button.type = 'button';
        button.innerHTML = cellHtml(row, column, item);
        button.addEventListener('click', event => {
          if (event.target.closest('.delete')) return;
          selectCell(shelf, row, column, item);
        });
        if (item) {
          button.querySelector('.delete').addEventListener('click', () => deletePackage(item.id).catch(error => {
            showMessage(error.message, 'error');
          }));
        }
        grid.append(button);
      }
    }

    section.append(grid);
    els.shelves.append(section);
  });
}

function cellHtml(row, column, item) {
  if (!item) {
    return `<span class="pos">R${row} / P${column}</span><span class="pkg">frei</span>`;
  }
  return `
    <span class="pos">R${row} / P${column}</span>
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
  await apiFetch('/api/regale', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  els.packageName.value = '';
  els.note.value = '';
  showMessage('Paket gespeichert.');
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

els.packageForm.addEventListener('submit', event => {
  submitPackage(event).catch(error => showMessage(error.message, 'error'));
});

render();
loadShelves().catch(error => {
  showMessage(error.message, 'error');
  render();
});
