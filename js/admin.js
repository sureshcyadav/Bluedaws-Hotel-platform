// ── Config ────────────────────────────────────────────────────
const API = 'https://bluedaws-hotel-platform.onrender.com';

let allBookings = [];
let allContacts = [];
let bookingFilter = 'all';
let contactFilter = 'all';

// ── Calendar state ────────────────────────────────────────────
let calBookings          = [];
let calBlocks            = [];
let _calCurrentBookingId = null;
let calWeekStart         = calGetMonday(new Date());

const CAL_ROOMS = [
  { code:'D6', name:'Single Room'     }, { code:'C3', name:'Twin Room'       },
  { code:'D3', name:'Twin Room'       }, { code:'B6', name:'Triple Room'     },
  { code:'C6', name:'Triple Room'     }, { code:'B8', name:'Dbl + Single'    },
  { code:'B7', name:'Family Room'     }, { code:'E2', name:'Family Room'     },
  { code:'E3', name:'Family Room'     }, { code:'B2', name:'Large Family'    },
  { code:'B4', name:'Large Family'    }, { code:'B5', name:'Group 6-bed'     },
  { code:'C1', name:'Group 6-bed'     }, { code:'C4', name:'Group 6-bed'     },
  { code:'D1', name:'Group 6-bed'     }, { code:'D2', name:'Group 6-bed'     },
  { code:'D5', name:'Group 6-bed'     }, { code:'B3', name:'Group Mixed'     },
  { code:'C5', name:'Group Mixed'     }, { code:'D4', name:'Group Mixed'     },
  { code:'Z6', name:'Large Group'     }, { code:'C2', name:'Large Group'     },
];

// ── Auth helpers ──────────────────────────────────────────────
const getToken   = () => localStorage.getItem('bdw_admin_token');
const setToken   = t  => localStorage.setItem('bdw_admin_token', t);
const clearToken = () => localStorage.removeItem('bdw_admin_token');

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

async function apiFetch(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401) { clearToken(); showLogin(); throw new Error('Session expired'); }
  return { ok: res.ok, data };
}

// ── Views ─────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
}

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  document.getElementById('section' + cap).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.section === name)
  );
  if (name === 'dashboard')    loadStats();
  if (name === 'frontdesk')   loadFrontDesk();
  if (name === 'bookings')    loadBookings();
  if (name === 'calendar')    loadCalendar();
  if (name === 'availability') loadAvailability();
  if (name === 'guests')      loadGuests();
  if (name === 'reports')     loadReports();
  if (name === 'contacts')    loadContacts();
  if (name === 'content')     loadContent();
}

// ── Login ──────────────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('adminPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

async function login() {
  const pw    = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');
  errEl.classList.add('hidden');

  if (!pw) { errEl.textContent = 'Please enter the password.'; errEl.classList.remove('hidden'); return; }

  btn.textContent = 'Signing in…';
  btn.disabled = true;

  try {
    const res  = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.message || 'Incorrect password.';
      errEl.classList.remove('hidden');
    } else {
      setToken(data.token);
      document.getElementById('adminPassword').value = '';
      showApp();
      showSection('dashboard');
    }
  } catch {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

// ── Logout ────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  showLogin();
});

// ── Nav ───────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
});

// ── Stats ─────────────────────────────────────────────────────
document.getElementById('refreshDash').addEventListener('click', loadStats);

async function loadStats() {
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/stats');
    if (!ok) return;
    const b = data.bookings, c = data.contacts;
    document.getElementById('statTotal').textContent     = b.total;
    document.getElementById('statPending').textContent   = b.pending;
    document.getElementById('statConfirmed').textContent = b.confirmed;
    document.getElementById('statCancelled').textContent = b.cancelled;
    document.getElementById('statRevenue').textContent   = '£' + Number(b.revenue).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    document.getElementById('statUnread').textContent    = c.unread;

    const pb = document.getElementById('pendingBadge');
    const ub = document.getElementById('unreadBadge');
    pb.textContent = +b.pending > 0 ? b.pending : '';
    ub.textContent = +c.unread  > 0 ? c.unread  : '';

    document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {}
}

// ── Front Desk ────────────────────────────────────────────────
document.getElementById('refreshFrontdesk').addEventListener('click', loadFrontDesk);

async function loadFrontDesk() {
  document.getElementById('fdDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  document.getElementById('fdSummary').innerHTML = '<div class="fd-loading">Loading…</div>';
  document.getElementById('fdRoomGrid').innerHTML = '<div class="fd-loading">Loading…</div>';
  document.getElementById('fdArrivalList').innerHTML   = '<div class="fd-empty">Loading…</div>';
  document.getElementById('fdDepartureList').innerHTML = '<div class="fd-empty">Loading…</div>';

  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/bookings');
    if (!ok) return;

    const today    = new Date().toISOString().slice(0, 10);
    const bookings = (data.data || []).filter(b => b.status !== 'cancelled');

    const roomStatus = {};
    const arrivals   = [];
    const departures = [];

    bookings.forEach(b => {
      // Always use UPPERCASE to match CAL_ROOMS codes (DB stores lowercase)
      const code = b.room_code.toUpperCase();
      const cin  = b.checkin_date  ? b.checkin_date.slice(0, 10)  : '';
      const cout = b.checkout_date ? b.checkout_date.slice(0, 10) : '';

      if (b.checked_in_at && !b.checked_out_at) {
        // Guest is physically in the hotel
        if (cout === today) {
          roomStatus[code] = 'departing';
          departures.push(b);
        } else {
          roomStatus[code] = 'occupied';
        }
      } else if (cin === today && !b.checked_in_at) {
        // Due to arrive today, not yet checked in
        roomStatus[code] = 'arriving';
        arrivals.push(b);
      }
      // Future bookings and past checkouts don't affect the room board
    });

    _renderFrontDesk(roomStatus, arrivals, departures);
  } catch {
    document.getElementById('fdSummary').innerHTML = '<div class="fd-loading" style="color:#ef4444">Failed to load. Please refresh.</div>';
  }
}

function _renderFrontDesk(roomStatus, arrivals, departures) {
  const occupied  = Object.values(roomStatus).filter(s => s === 'occupied').length;
  const available = CAL_ROOMS.length - Object.keys(roomStatus).length;

  const SVG_ARR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
  const SVG_DEP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
  const SVG_BED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>';
  const SVG_CHK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';

  document.getElementById('fdSummary').innerHTML = [
    { label: 'Arriving Today',     val: arrivals.length,   cls: 'fd-stat-arriving',  icon: SVG_ARR },
    { label: 'Departing Today',    val: departures.length, cls: 'fd-stat-departing', icon: SVG_DEP },
    { label: 'Currently Occupied', val: occupied,          cls: 'fd-stat-occupied',  icon: SVG_BED },
    { label: 'Available Now',      val: available,         cls: 'fd-stat-available', icon: SVG_CHK },
  ].map(s => '<div class="fd-stat-card ' + s.cls + '">'
    + '<div class="fd-stat-icon">' + s.icon + '</div>'
    + '<div><div class="fd-stat-val">' + s.val + '</div><div class="fd-stat-label">' + s.label + '</div></div>'
    + '</div>'
  ).join('');

  const stLabel = { available: 'Free', arriving: 'Arriving', occupied: 'Occupied', departing: 'Check-out' };
  document.getElementById('fdRoomGrid').innerHTML = CAL_ROOMS.map(r => {
    const st = roomStatus[r.code] || 'available';
    return '<div class="fd-room-tile fd-' + st + '" title="' + r.name + ' — ' + stLabel[st] + '">'
      + '<span class="fd-room-code">' + r.code + '</span>'
      + '<span class="fd-room-name">' + r.name + '</span>'
      + '<span class="fd-room-st">' + stLabel[st] + '</span>'
      + '</div>';
  }).join('');

  const payLabel = { card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };

  const arrivalRow = b => '<div class="fd-guest-row">'
    + '<div class="fd-guest-info"><strong>' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</strong>'
    + '<span>' + esc(b.room_name) + ' · ' + b.room_code.toUpperCase() + ' · ' + b.nights + ' night' + (b.nights > 1 ? 's' : '') + ' · ' + (payLabel[b.payment_method] || b.payment_method) + '</span></div>'
    + '<div class="fd-guest-meta"><span class="fd-ref">' + b.ref + '</span></div>'
    + '<div class="fd-guest-actions">'
    + (b.checked_in_at
        ? '<span class="fd-done-badge">✓ Checked In</span>'
        : '<button class="btn-fd-checkin" onclick="checkInGuest(' + b.id + ')">Check In</button>')
    + '</div></div>';

  const departureRow = b => '<div class="fd-guest-row">'
    + '<div class="fd-guest-info"><strong>' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</strong>'
    + '<span>' + esc(b.room_name) + ' · ' + b.room_code.toUpperCase() + ' · £' + Number(b.total_amount).toLocaleString() + '</span></div>'
    + '<div class="fd-guest-meta"><span class="fd-ref">' + b.ref + '</span></div>'
    + '<div class="fd-guest-actions">'
    + (b.checked_out_at
        ? '<span class="fd-done-badge">✓ Checked Out</span>'
        : '<button class="btn-fd-checkout" onclick="checkOutGuest(' + b.id + ')">Check Out</button>')
    + '</div></div>';

  document.getElementById('fdArrivalCount').textContent   = arrivals.length;
  document.getElementById('fdDepartureCount').textContent = departures.length;

  document.getElementById('fdArrivalList').innerHTML = arrivals.length
    ? arrivals.map(arrivalRow).join('')
    : '<div class="fd-empty">No arrivals today</div>';

  document.getElementById('fdDepartureList').innerHTML = departures.length
    ? departures.map(departureRow).join('')
    : '<div class="fd-empty">No departures today</div>';
}

// ── Bookings ──────────────────────────────────────────────────
document.getElementById('refreshBookings').addEventListener('click', loadBookings);

async function loadBookings() {
  document.getElementById('bookingsBody').innerHTML =
    '<tr><td colspan="11" class="table-loading">Loading…</td></tr>';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/bookings');
    if (!ok) return;
    allBookings = data.data;
    renderBookings();
  } catch {
    document.getElementById('bookingsBody').innerHTML =
      '<tr><td colspan="11" class="table-error">Failed to load bookings.</td></tr>';
  }
}

let _bookingSearchTerm = '';

function filterBookings() {
  _bookingSearchTerm = (document.getElementById('bookingSearch').value || '').toLowerCase();
  renderBookings();
}

function renderBookings() {
  let list = bookingFilter === 'all' ? allBookings : allBookings.filter(b => b.status === bookingFilter);
  if (_bookingSearchTerm) {
    list = list.filter(b =>
      (b.guest_first_name + ' ' + b.guest_last_name).toLowerCase().includes(_bookingSearchTerm) ||
      b.guest_email.toLowerCase().includes(_bookingSearchTerm) ||
      b.ref.toLowerCase().includes(_bookingSearchTerm) ||
      b.room_code.toLowerCase().includes(_bookingSearchTerm) ||
      b.room_name.toLowerCase().includes(_bookingSearchTerm)
    );
  }
  const tbody = document.getElementById('bookingsBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="table-empty">No bookings found.</td></tr>';
    return;
  }
  const payLabel = { card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  tbody.innerHTML = list.map(b => {
    const checkedIn  = !!b.checked_in_at;
    const checkedOut = !!b.checked_out_at;
    let statusHtml = '<span class="status-badge status-' + b.status + '">' + b.status + '</span>';
    if (checkedIn && !checkedOut) statusHtml += ' <span class="status-badge status-checkedin">Checked In</span>';
    if (checkedOut)               statusHtml += ' <span class="status-badge status-checkedout">Checked Out</span>';
    const hasNotes = b.admin_notes || b.special_requests;
    const hasId    = b.guest_id_number || b.guest_id_type;
    return '<tr>'
      + '<td><span class="ref-badge">' + b.ref + '</span>'
      + (hasNotes ? ' <span class="notes-dot" title="Has notes">●</span>' : '') + '</td>'
      + '<td><strong>' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</strong>'
      + (hasId ? ' <span class="bpd-id-badge" title="Identity on file">ID&#10003;</span>' : '')
      + '<br><small>' + esc(b.guest_country) + '</small></td>'
      + '<td><a href="mailto:' + esc(b.guest_email) + '">' + esc(b.guest_email) + '</a><br><small>' + esc(b.guest_phone) + '</small></td>'
      + '<td>' + esc(b.room_name) + '<br><small style="font-family:monospace">' + b.room_code.toUpperCase() + '</small></td>'
      + '<td>' + fmtDate(b.checkin_date) + '</td>'
      + '<td>' + fmtDate(b.checkout_date) + '</td>'
      + '<td>' + b.nights + '</td>'
      + '<td>£' + Number(b.total_amount).toLocaleString() + '</td>'
      + '<td>' + (payLabel[b.payment_method] || b.payment_method) + '</td>'
      + '<td>' + statusHtml + '</td>'
      + '<td class="actions-cell">'
      + (b.status === 'pending'   ? '<button class="btn-action btn-confirm" onclick="updateBooking(' + b.id + ',\'confirmed\')">Confirm</button>' : '')
      + (b.status !== 'cancelled' ? '<button class="btn-action btn-cancel"  onclick="updateBooking(' + b.id + ',\'cancelled\')">Cancel</button>'  : '')
      + (b.status === 'cancelled' ? '<button class="btn-action btn-restore" onclick="updateBooking(' + b.id + ',\'pending\')">Restore</button>'   : '')
      + '<button class="btn-profile" onclick="openCalBooking(' + b.id + ')" title="Guest profile">&#128100; Profile</button>'
      + '</td></tr>';
  }).join('');
}

async function updateBooking(id, status) {
  const labels = { confirmed: 'confirm', cancelled: 'cancel', pending: 'restore' };
  if (!confirm('Are you sure you want to ' + labels[status] + ' this booking?')) return;
  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + id + '/status', { status });
    if (!ok) { alert(data.message); return; }
    const b = allBookings.find(x => x.id === id);
    if (b) b.status = status;
    renderBookings();
    loadStats();
  } catch { alert('Failed to update booking.'); }
}

document.getElementById('bookingFilters').addEventListener('click', e => {
  if (!e.target.classList.contains('filter-btn')) return;
  document.querySelectorAll('#bookingFilters .filter-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  bookingFilter = e.target.dataset.filter;
  renderBookings();
});

// ── Contacts ──────────────────────────────────────────────────
document.getElementById('refreshContacts').addEventListener('click', loadContacts);

async function loadContacts() {
  document.getElementById('contactsBody').innerHTML =
    '<tr><td colspan="8" class="table-loading">Loading…</td></tr>';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/contacts');
    if (!ok) return;
    allContacts = data.data;
    renderContacts();
  } catch {
    document.getElementById('contactsBody').innerHTML =
      '<tr><td colspan="8" class="table-error">Failed to load messages.</td></tr>';
  }
}

function renderContacts() {
  const list = contactFilter === 'all' ? allContacts : allContacts.filter(c => c.status === contactFilter);
  const tbody = document.getElementById('contactsBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No messages found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(c => '<tr>'
    + '<td><strong>' + c.first_name + ' ' + c.last_name + '</strong></td>'
    + '<td><a href="mailto:' + c.email + '">' + c.email + '</a></td>'
    + '<td>' + (c.phone || '—') + '</td>'
    + '<td>' + c.subject + '</td>'
    + '<td><span class="msg-preview">' + c.message.substring(0, 55) + (c.message.length > 55 ? '…' : '') + '</span>'
    + '<button class="btn-read-more" onclick="openModal(' + c.id + ')">Read more</button></td>'
    + '<td>' + fmtDateTime(c.created_at) + '</td>'
    + '<td><span class="status-badge status-' + c.status + '">' + c.status + '</span></td>'
    + '<td class="actions-cell">'
    + (c.status === 'unread'  ? '<button class="btn-action btn-confirm" onclick="updateContact(' + c.id + ',\'read\')">Mark Read</button>' : '')
    + (c.status !== 'replied' ? '<button class="btn-action btn-restore" onclick="updateContact(' + c.id + ',\'replied\')">Mark Replied</button>' : '')
    + '</td></tr>'
  ).join('');
}

async function updateContact(id, status) {
  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/contacts/' + id + '/status', { status });
    if (!ok) { alert(data.message); return; }
    const c = allContacts.find(x => x.id === id);
    if (c) c.status = status;
    renderContacts();
    loadStats();
  } catch { alert('Failed to update message.'); }
}

document.getElementById('contactFilters').addEventListener('click', e => {
  if (!e.target.classList.contains('filter-btn')) return;
  document.querySelectorAll('#contactFilters .filter-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  contactFilter = e.target.dataset.filter;
  renderContacts();
});

// ── Content ───────────────────────────────────────────────────
let _currentCtab    = 'prices';
let _allSettingsData = [];

async function loadContent() {
  document.getElementById('contentSections').innerHTML = '<div class="table-loading">Loading…</div>';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/content');
    if (!ok) return;
    _allSettingsData = data.data;
    document.querySelectorAll('.ctab').forEach(btn => {
      btn.onclick = () => switchCtab(btn.dataset.ctab);
    });
    switchCtab(_currentCtab);
  } catch {
    document.getElementById('contentSections').innerHTML = '<div class="table-error">Failed to load content.</div>';
  }
}

function switchCtab(tab) {
  _currentCtab = tab;
  document.querySelectorAll('.ctab').forEach(b => b.classList.toggle('active', b.dataset.ctab === tab));
  const grouped = {};
  _allSettingsData.forEach(s => { (grouped[s.category] = grouped[s.category] || []).push(s); });
  const c = document.getElementById('contentSections');
  if (tab === 'prices')       c.innerHTML = _renderPrices(grouped.rooms || []);
  else if (tab === 'hotel')   c.innerHTML = _renderHotel(grouped.hotel || []);
  else if (tab === 'images')  c.innerHTML = _renderImages(grouped.images || []);
  else if (tab === 'promotion')    c.innerHTML = _renderPromotion(grouped.promotion || []);
  else if (tab === 'announcement') c.innerHTML = _renderAnnounce(grouped.announcement || []);
}

function _cfField(s, type, prefix) {
  type   = type   || 'text';
  prefix = prefix || '';
  return '<div class="cf-item">'
    + '<label class="cf-label">' + s.label + '</label>'
    + '<div class="cf-row">'
    + (prefix ? '<span class="cf-prefix">' + prefix + '</span>' : '')
    + '<input type="' + type + '" class="cf-input" id="cfi-' + s.key + '" value="' + esc(s.value) + '"' + (type === 'number' ? ' min="0" step="1"' : '') + '>'
    + '<button class="btn-cf-save" onclick="saveContent(\'' + s.key + '\')">Save</button>'
    + '</div>'
    + '<span class="cf-feedback hidden" id="cfb-' + s.key + '">Saved!</span>'
    + '</div>';
}

function _cfImageField(s) {
  const hasImg = s.value && s.value.indexOf('http') === 0;
  return '<div class="cf-item">'
    + '<label class="cf-label">' + s.label + '</label>'
    + '<div class="cf-img-wrap">'
    + (hasImg
        ? '<img class="cf-img-preview" id="cfp-' + s.key + '" src="' + esc(s.value) + '" alt="" onerror="this.style.display=\'none\'">'
        : '<div class="cf-img-placeholder" id="cfp-' + s.key + '">No image</div>')
    + '<div class="cf-img-input-wrap">'
    + '<div class="cf-row">'
    + '<input type="url" class="cf-input" id="cfi-' + s.key + '" value="' + esc(s.value) + '" placeholder="https://...">'
    + '<button class="btn-cf-save" onclick="saveContent(\'' + s.key + '\',true)">Save</button>'
    + '</div>'
    + '<span class="cf-feedback hidden" id="cfb-' + s.key + '">Saved!</span>'
    + '</div></div></div>';
}

function _cfToggle(s, liveLabel, offLabel) {
  const on = s.value === 'true';
  return '<div class="cf-item cf-toggle-row">'
    + '<label class="cf-label">' + s.label + '</label>'
    + '<div class="cf-toggle-wrap">'
    + '<label class="toggle-switch">'
    + '<input type="checkbox" id="cfi-' + s.key + '"' + (on ? ' checked' : '') + ' onchange="saveToggle(\'' + s.key + '\',\'' + liveLabel + '\',\'' + offLabel + '\')">'
    + '<span class="toggle-slider"></span>'
    + '</label>'
    + '<span class="toggle-label" id="tgl-' + s.key + '">' + (on ? liveLabel : offLabel) + '</span>'
    + '</div></div>';
}

function _renderPrices(list) {
  const byCode = {};
  list.forEach(s => {
    const code = s.key.replace('room_', '').replace('_price', '').toUpperCase();
    byCode[code] = s;
  });

  const GROUPS = [
    { label: 'Single Room',        codes: ['D6'],                             color: '#6366f1' },
    { label: 'Twin Room',          codes: ['C3', 'D3'],                       color: '#0891b2' },
    { label: 'Triple Room',        codes: ['B6', 'C6'],                       color: '#7c3aed' },
    { label: 'Double + Single',    codes: ['B8'],                             color: '#0f766e' },
    { label: 'Family Room',        codes: ['B7', 'E2', 'E3'],                 color: '#059669' },
    { label: 'Large Family Room',  codes: ['B2', 'B4'],                       color: '#d97706' },
    { label: 'Group Room (6-Bed)', codes: ['B5', 'C1', 'C4', 'D1', 'D2', 'D5'], color: '#c9a96e' },
    { label: 'Group Room Mixed',   codes: ['B3', 'C5', 'D4'],                color: '#ea580c' },
    { label: 'Large Group Room',   codes: ['Z6', 'C2'],                       color: '#0f172a' },
  ];

  const allGroupedCodes = GROUPS.flatMap(g => g.codes);
  let html = '<div class="content-block">'
    + '<div class="content-block-header" style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div><h3>Room Prices</h3><p>Price per night in GBP · Click Save on any room to update</p></div>'
    + '</div>';

  GROUPS.forEach(g => {
    const items = g.codes.map(code => byCode[code]).filter(Boolean);
    if (!items.length) return;
    html += '<div class="price-group">'
      + '<div class="price-group-header">'
      + '<span class="price-group-dot" style="background:' + g.color + '"></span>'
      + '<span class="price-group-label">' + g.label + '</span>'
      + '<span class="price-group-count">' + items.length + ' room' + (items.length > 1 ? 's' : '') + '</span>'
      + '</div>'
      + '<div class="price-cards-grid">'
      + items.map(s => {
          const code = s.key.replace('room_', '').replace('_price', '').toUpperCase();
          const name = s.label.replace(/\s*\([A-Z0-9]+\)\s*$/, '').trim();
          return '<div class="price-card">'
            + '<div class="price-card-top">'
            + '<span class="price-card-code" style="background:' + g.color + '">' + code + '</span>'
            + '<span class="price-card-name">' + name + '</span>'
            + '</div>'
            + '<div class="cf-row">'
            + '<span class="cf-prefix">£</span>'
            + '<input type="number" class="cf-input" id="cfi-' + s.key + '" value="' + esc(s.value) + '" min="0" step="1">'
            + '<button class="btn-cf-save" onclick="saveContent(\'' + s.key + '\')">Save</button>'
            + '</div>'
            + '<span class="cf-feedback hidden" id="cfb-' + s.key + '">&#10003; Saved!</span>'
            + '</div>';
        }).join('')
      + '</div></div>';
  });

  const others = list.filter(s => {
    const code = s.key.replace('room_', '').replace('_price', '').toUpperCase();
    return !allGroupedCodes.includes(code);
  });
  if (others.length) {
    html += '<div class="price-group"><div class="price-group-header"><span class="price-group-label">Other Rooms</span></div>'
      + '<div class="price-cards-grid">' + others.map(s => _cfField(s, 'number', '£')).join('') + '</div></div>';
  }

  return html + '</div>';
}

function _renderHotel(list) {
  return '<div class="content-block">'
    + '<div class="content-block-header"><h3>Hotel Settings</h3><p>General information and policies</p></div>'
    + '<div class="content-list">' + list.map(s => _cfField(s)).join('') + '</div>'
    + '</div>';
}

function _renderImages(list) {
  return '<div class="content-block">'
    + '<div class="content-block-header"><h3>Images</h3><p>Paste any public image URL (Cloudinary, Imgur, etc.)</p></div>'
    + '<div class="content-list">' + list.map(s => _cfImageField(s)).join('') + '</div>'
    + '</div>';
}

function _renderPromotion(list) {
  const active = list.find(s => s.key === 'promo_active');
  const rest   = list.filter(s => s.key !== 'promo_active');
  return '<div class="content-block">'
    + '<div class="content-block-header"><h3>Promotion</h3><p>A featured offer shown on the homepage when active</p></div>'
    + '<div class="content-list">'
    + (active ? _cfToggle(active, 'Promotion is LIVE', 'Promotion is OFF') : '')
    + rest.map(s => _cfField(s)).join('')
    + '</div></div>';
}

function _renderAnnounce(list) {
  const active = list.find(s => s.key === 'ann_active');
  const rest   = list.filter(s => s.key !== 'ann_active');
  return '<div class="content-block">'
    + '<div class="content-block-header"><h3>Announcement Banner</h3><p>A notice shown at the top of every page — toggle ON to make it live</p></div>'
    + '<div class="content-list">'
    + (active ? _cfToggle(active, 'Banner is LIVE on website', 'Banner is hidden') : '')
    + rest.map(s => _cfField(s)).join('')
    + '</div></div>';
}

async function saveToggle(key, liveLabel, offLabel) {
  const input = document.getElementById('cfi-' + key);
  const label = document.getElementById('tgl-' + key);
  const value = input.checked ? 'true' : 'false';
  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/content/' + key, { value });
    if (!ok) { alert(data.message); input.checked = !input.checked; return; }
    const item = _allSettingsData.find(s => s.key === key);
    if (item) item.value = value;
    if (label) label.textContent = input.checked ? liveLabel : offLabel;
  } catch { alert('Failed to save.'); input.checked = !input.checked; }
}

async function saveContent(key, isImage) {
  const input    = document.getElementById('cfi-' + key);
  const feedback = document.getElementById('cfb-' + key);
  const btn      = isImage
    ? input.closest('.cf-img-input-wrap').querySelector('.btn-cf-save')
    : input.closest('.cf-row').querySelector('.btn-cf-save');

  btn.textContent = 'Saving…';
  btn.disabled    = true;

  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/content/' + key, { value: input.value });
    if (!ok) { alert(data.message); return; }
    const item = _allSettingsData.find(s => s.key === key);
    if (item) item.value = input.value;
    if (isImage && input.value) {
      const prev = document.getElementById('cfp-' + key);
      if (prev) prev.outerHTML = '<img class="cf-img-preview" id="cfp-' + key + '" src="' + esc(input.value) + '" alt="" onerror="this.style.display=\'none\'">';
    }
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 2500);
  } catch { alert('Failed to save.'); }
  finally { btn.textContent = 'Save'; btn.disabled = false; }
}

// ── Calendar ───────────────────────────────────────────────────
document.getElementById('refreshCalendar').addEventListener('click', loadCalendar);

function calGetMonday(date) {
  var d = new Date(date); d.setHours(0,0,0,0);
  var day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function calNav(dir) {
  calWeekStart = new Date(calWeekStart);
  calWeekStart.setDate(calWeekStart.getDate() + dir * 7);
  renderCalendar();
}

function calGoToday() {
  calWeekStart = calGetMonday(new Date());
  renderCalendar();
}

async function loadCalendar() {
  document.getElementById('calGrid').innerHTML = '<div class="table-loading">Loading…</div>';
  try {
    const [bRes, blRes] = await Promise.all([
      apiFetch('GET', '/api/admin/bookings'),
      apiFetch('GET', '/api/admin/blocks'),
    ]);
    if (!bRes.ok) return;
    calBookings = bRes.data.data;
    calBlocks   = blRes.ok ? blRes.data.data : [];
    renderCalendar();
  } catch {
    document.getElementById('calGrid').innerHTML = '<div class="table-error">Failed to load calendar.</div>';
  }
}

function renderCalendar() {
  var today   = new Date(); today.setHours(0,0,0,0);
  var weekEnd = new Date(calWeekStart); weekEnd.setDate(weekEnd.getDate() + 7);

  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(calWeekStart); d.setDate(d.getDate() + i);
    days.push(d);
  }

  var fmt = function(d, o) { return d.toLocaleDateString('en-GB', o); };
  document.getElementById('calRangeLabel').textContent =
    fmt(days[0], { day:'numeric', month:'short' }) + ' – ' +
    fmt(days[6], { day:'numeric', month:'short', year:'numeric' });

  var html = '<div class="cal-head-row">';
  html += '<div class="cal-room-col-hdr">Room</div>';
  html += '<div class="cal-days-hdr">';
  days.forEach(function(d) {
    var isToday = d.getTime() === today.getTime();
    html += '<div class="cal-day-hdr' + (isToday ? ' cal-today' : '') + '">'
      + '<div class="cal-dname">' + fmt(d, { weekday:'short' }) + '</div>'
      + '<div class="cal-dnum">'  + d.getDate() + ' ' + fmt(d, { month:'short' }) + '</div>'
      + '</div>';
  });
  html += '</div></div>';

  html += '<div class="cal-body">';
  CAL_ROOMS.forEach(function(room) {
    var bookings = calBookings.filter(function(b) {
      if (b.room_code.toUpperCase() !== room.code) return false;
      if (b.status === 'cancelled') return false;
      return new Date(b.checkout_date) > calWeekStart && new Date(b.checkin_date) < weekEnd;
    });

    var blocks = (calBlocks || []).filter(function(bl) {
      if (bl.room_code.toUpperCase() !== room.code) return false;
      var bs = new Date(bl.start_date); bs.setHours(0,0,0,0);
      var be = new Date(bl.end_date);   be.setHours(0,0,0,0);
      return be > calWeekStart && bs < weekEnd;
    });

    html += '<div class="cal-row">';
    html += '<div class="cal-room-label">'
      + '<strong class="cal-rcode">' + room.code + '</strong>'
      + '<span class="cal-rname">'   + room.name + '</span>'
      + '</div>';
    html += '<div class="cal-cells">';

    days.forEach(function(d) {
      html += '<div class="cal-cell' + (d.getTime() === today.getTime() ? ' cal-cell-today' : '') + '"></div>';
    });

    // Room blocks — hatched grey bars (behind bookings)
    blocks.forEach(function(bl) {
      var bs = new Date(bl.start_date); bs.setHours(0,0,0,0);
      var be = new Date(bl.end_date);   be.setHours(0,0,0,0);
      var startDay = Math.max(0, Math.round((bs - calWeekStart) / 86400000));
      var endDay   = Math.min(7, Math.round((be - calWeekStart) / 86400000));
      var spanDays = endDay - startDay;
      if (spanDays <= 0) return;
      var left  = (startDay / 7 * 100).toFixed(3);
      var width = (spanDays / 7 * 100).toFixed(3);
      html += '<div class="cal-block cal-bk-blocked"'
        + ' style="left:' + left + '%;width:' + width + '%;z-index:1"'
        + ' title="' + esc(bl.reason ? 'Blocked: ' + bl.reason : 'Blocked') + '">'
        + '<span class="cal-bk-name">&#9888; ' + esc(bl.reason || 'Blocked') + '</span>'
        + '</div>';
    });

    // Booking blocks — clickable coloured bars (on top)
    bookings.forEach(function(b) {
      var ci = new Date(b.checkin_date);
      var co = new Date(b.checkout_date);
      var bs = ci < calWeekStart ? calWeekStart : ci;
      var be = co > weekEnd      ? weekEnd      : co;
      var startDay = Math.round((bs - calWeekStart) / 86400000);
      var spanDays = Math.round((be - bs)           / 86400000);
      if (spanDays <= 0) return;

      var left  = (startDay / 7 * 100).toFixed(3);
      var width = (spanDays / 7 * 100).toFixed(3);
      var guestName = b.guest_first_name + ' ' + b.guest_last_name;

      // Pick colour class based on actual in-hotel state, not just status field
      var blockClass;
      if (b.checked_out_at)     blockClass = 'cal-bk-checkedout';
      else if (b.checked_in_at) blockClass = 'cal-bk-checkedin';
      else                       blockClass = 'cal-bk-' + b.status; // confirmed / pending

      var titleTip = esc(guestName) + ' · ' + b.ref
        + (b.checked_in_at && !b.checked_out_at ? ' · In House' : '')
        + (b.checked_out_at ? ' · Checked Out' : '');

      html += '<div class="cal-block ' + blockClass + '"'
        + ' style="left:' + left + '%;width:' + width + '%;z-index:2"'
        + ' onclick="openCalBooking(' + b.id + ')"'
        + ' title="' + titleTip + '">'
        + '<span class="cal-bk-name">' + esc(guestName) + '</span>'
        + '<span class="cal-bk-ref">'  + b.ref + '</span>'
        + '</div>';
    });

    html += '</div></div>';
  });
  html += '</div>';

  document.getElementById('calGrid').innerHTML = html;
}

function openCalBooking(id) {
  var b = calBookings.find(function(x) { return x.id === id; });
  if (!b) b = allBookings.find(function(x) { return x.id === id; });
  if (!b) return;
  _calCurrentBookingId = id;

  var pay = { card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };

  // Dark header
  document.getElementById('bpName').textContent = b.guest_first_name + ' ' + b.guest_last_name;
  document.getElementById('bpMeta').textContent =
    (b.room_name || b.room_code.toUpperCase()) + ' (' + b.room_code.toUpperCase() + ')  ·  ' + b.ref;
  var badgeHtml = '<span class="status-badge status-' + b.status + '">'
    + b.status.charAt(0).toUpperCase() + b.status.slice(1) + '</span>';
  if (b.checked_in_at && !b.checked_out_at)
    badgeHtml += ' <span class="status-badge status-checkedin">Checked In</span>';
  if (b.checked_out_at)
    badgeHtml += ' <span class="status-badge status-checkedout">Checked Out</span>';
  document.getElementById('bpBadges').innerHTML = badgeHtml;

  // Stay card
  document.getElementById('bpCheckin').textContent  = fmtDate(b.checkin_date);
  document.getElementById('bpCheckout').textContent = fmtDate(b.checkout_date);
  document.getElementById('bpNights').textContent   = b.nights + (b.nights === 1 ? ' night' : ' nights');
  document.getElementById('bpGuests').textContent   = b.adults + ' adult' + (b.adults !== 1 ? 's' : '')
    + (b.children > 0 ? ' · ' + b.children + ' child' + (b.children > 1 ? 'ren' : '') : '');
  document.getElementById('bpTotal').textContent    = '£' + Number(b.total_amount).toLocaleString();
  document.getElementById('bpPayment').textContent  = pay[b.payment_method] || b.payment_method;

  // Guest card
  document.getElementById('bpGuestName').textContent    = b.guest_first_name + ' ' + b.guest_last_name;
  var em = document.getElementById('bpGuestEmail');
  em.textContent = b.guest_email; em.href = 'mailto:' + b.guest_email;
  document.getElementById('bpGuestPhone').textContent   = b.guest_phone   || '—';
  document.getElementById('bpGuestCountry').textContent = b.guest_country  || '—';
  document.getElementById('bpBookedOn').textContent     = fmtDate(b.created_at);

  // Identity form (pre-fill saved data)
  document.getElementById('bp_id_type').value    = b.guest_id_type     || '';
  document.getElementById('bp_id_number').value  = b.guest_id_number   || '';
  document.getElementById('bp_dob').value         = b.guest_dob ? b.guest_dob.slice(0, 10) : '';
  document.getElementById('bp_nationality').value = b.guest_nationality || '';

  // Payment form
  document.getElementById('bp_payment_status').value = b.payment_status || 'unpaid';
  document.getElementById('bp_amount_paid').value    = b.amount_paid    || '';
  document.getElementById('bp_payment_mode').value   = b.payment_mode   || '';
  document.getElementById('bp_payment_note').value   = b.payment_note   || '';

  // Notes form (pre-fill saved data)
  document.getElementById('bp_requests').value = b.special_requests || '';
  document.getElementById('bp_notes').value    = b.admin_notes      || '';

  // Reset save feedback
  document.getElementById('bpSaveFeedback').classList.add('hidden');
  document.getElementById('bpSaveError').classList.add('hidden');

  // Action footer
  var foot = '';
  if (b.status === 'pending')
    foot += '<button class="btn-action btn-confirm" onclick="bpAction(\'confirmed\')">Confirm Booking</button>';
  if (b.status !== 'cancelled')
    foot += '<button class="btn-action btn-cancel" onclick="bpAction(\'cancelled\')">Cancel Booking</button>';
  if (b.status === 'cancelled')
    foot += '<button class="btn-action" style="background:#475569;color:#fff;padding:6px 12px" onclick="bpAction(\'pending\')">Restore Booking</button>';
  foot += '<span style="flex:1"></span>';
  if (b.status === 'confirmed' && !b.checked_in_at)
    foot += '<button class="btn-fd-checkin" style="min-width:110px" onclick="bpCheckIn()">&#10003; Check In</button>';
  if (b.checked_in_at && !b.checked_out_at)
    foot += '<button class="btn-fd-checkout" style="min-width:110px" onclick="bpCheckOut()">Check Out</button>';
  if (b.checked_in_at && b.checked_out_at)
    foot += '<span class="fd-done-badge">&#10003; Checked Out</span>';
  document.getElementById('bpFooter').innerHTML = foot;

  document.getElementById('bookingProfileModal').classList.remove('hidden');
}

async function bpAction(newStatus) {
  if (!_calCurrentBookingId) return;
  if (!confirm('Change booking status to "' + newStatus + '"?')) return;
  const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + _calCurrentBookingId + '/status', { status: newStatus });
  if (!ok) { alert(data.message || 'Failed to update status.'); return; }
  [calBookings, allBookings].forEach(arr => {
    var b = arr.find(x => x.id === _calCurrentBookingId);
    if (b) b.status = newStatus;
  });
  openCalBooking(_calCurrentBookingId);
  renderCalendar();
}

async function bpCheckIn() {
  if (!_calCurrentBookingId) return;
  const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + _calCurrentBookingId + '/checkin', {});
  if (!ok) { alert(data.message || 'Check-in failed.'); return; }
  var ts = new Date().toISOString();
  [calBookings, allBookings].forEach(arr => {
    var b = arr.find(x => x.id === _calCurrentBookingId);
    if (b) { b.checked_in_at = ts; b.status = 'confirmed'; }
  });
  openCalBooking(_calCurrentBookingId);
  renderCalendar();
}

async function bpCheckOut() {
  if (!_calCurrentBookingId || !confirm('Mark guest as checked out?')) return;
  const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + _calCurrentBookingId + '/checkout', {});
  if (!ok) { alert(data.message || 'Check-out failed.'); return; }
  var ts = new Date().toISOString();
  [calBookings, allBookings].forEach(arr => {
    var b = arr.find(x => x.id === _calCurrentBookingId);
    if (b) b.checked_out_at = ts;
  });
  openCalBooking(_calCurrentBookingId);
  renderCalendar();
}

async function saveGuestProfile() {
  if (!_calCurrentBookingId) return;
  const btn = document.getElementById('bpSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  document.getElementById('bpSaveFeedback').classList.add('hidden');
  document.getElementById('bpSaveError').classList.add('hidden');
  try {
    const payload = {
      guest_id_type:     document.getElementById('bp_id_type').value        || null,
      guest_id_number:   document.getElementById('bp_id_number').value      || null,
      guest_dob:         document.getElementById('bp_dob').value            || null,
      guest_nationality: document.getElementById('bp_nationality').value    || null,
      payment_status:    document.getElementById('bp_payment_status').value || null,
      amount_paid:       document.getElementById('bp_amount_paid').value    || null,
      payment_mode:      document.getElementById('bp_payment_mode').value   || null,
      payment_note:      document.getElementById('bp_payment_note').value   || null,
      admin_notes:       document.getElementById('bp_notes').value          || null,
      special_requests:  document.getElementById('bp_requests').value       || null,
    };
    const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + _calCurrentBookingId + '/guest', payload);
    if (!ok) {
      document.getElementById('bpSaveError').textContent = data.message || 'Save failed.';
      document.getElementById('bpSaveError').classList.remove('hidden');
      return;
    }
    [calBookings, allBookings].forEach(arr => {
      var b = arr.find(x => x.id === _calCurrentBookingId);
      if (b) Object.assign(b, payload);
    });
    document.getElementById('bpSaveFeedback').classList.remove('hidden');
    setTimeout(() => document.getElementById('bpSaveFeedback').classList.add('hidden'), 3000);
    renderBookings(); // refresh bookings list so ID badge updates
  } finally {
    btn.disabled = false; btn.textContent = 'Save Guest Info';
  }
}

// ── Message Modal ─────────────────────────────────────────────
function openModal(id) {
  const c = allContacts.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modalTitle').textContent = c.first_name + ' ' + c.last_name + ' — ' + c.subject;
  document.getElementById('modalBody').innerHTML =
    '<div class="modal-meta">'
    + '<span>Email: <a href="mailto:' + c.email + '">' + c.email + '</a></span>'
    + (c.phone ? '<span>Phone: ' + c.phone + '</span>' : '')
    + '<span>Received: ' + fmtDateTime(c.created_at) + '</span>'
    + '<span>Status: <span class="status-badge status-' + c.status + '">' + c.status + '</span></span>'
    + '</div>'
    + '<p class="modal-message">' + c.message.replace(/\n/g, '<br>') + '</p>'
    + '<div class="modal-actions">'
    + '<a href="mailto:' + c.email + '?subject=Re: ' + encodeURIComponent(c.subject) + '" class="btn-action btn-confirm" onclick="updateContact(' + c.id + ',\'replied\')">Reply via Email</a>'
    + '</div>';
  document.getElementById('messageModal').classList.remove('hidden');
  if (c.status === 'unread') updateContact(id, 'read');
}

document.getElementById('modalClose').addEventListener('click', () =>
  document.getElementById('messageModal').classList.add('hidden')
);
document.getElementById('messageModal').addEventListener('click', e => {
  if (e.target === document.getElementById('messageModal'))
    document.getElementById('messageModal').classList.add('hidden');
});

document.getElementById('bookingProfileClose').addEventListener('click', () =>
  document.getElementById('bookingProfileModal').classList.add('hidden')
);
document.getElementById('bookingProfileModal').addEventListener('click', e => {
  if (e.target === document.getElementById('bookingProfileModal'))
    document.getElementById('bookingProfileModal').classList.add('hidden');
});

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Check In / Check Out ─────────────────────────────────────
async function checkInGuest(id) {
  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + id + '/checkin', {});
    if (!ok) { alert(data.message); return; }
    const b = allBookings.find(x => x.id === id);
    if (b) b.checked_in_at = new Date().toISOString();
    loadFrontDesk();
  } catch { alert('Failed to check in.'); }
}

async function checkOutGuest(id) {
  if (!confirm('Mark this guest as checked out?')) return;
  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + id + '/checkout', {});
    if (!ok) { alert(data.message); return; }
    const b = allBookings.find(x => x.id === id);
    if (b) b.checked_out_at = new Date().toISOString();
    loadFrontDesk();
  } catch { alert('Failed to check out.'); }
}

// ── New Walk-in Booking Modal ─────────────────────────────────
document.getElementById('openNewBookingBtn').addEventListener('click', openNewBookingModal);
document.getElementById('newBookingClose').addEventListener('click',   closeNewBookingModal);
document.getElementById('newBookingCancelBtn').addEventListener('click', closeNewBookingModal);
document.getElementById('newBookingModal').addEventListener('click', e => {
  if (e.target === document.getElementById('newBookingModal')) closeNewBookingModal();
});

function openNewBookingModal() {
  const sel = document.getElementById('nb_room');
  if (sel.options.length <= 1) {
    CAL_ROOMS.forEach(r => {
      const o = document.createElement('option');
      o.value = r.code.toLowerCase();
      o.textContent = r.code + ' — ' + r.name;
      sel.appendChild(o);
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  document.getElementById('nb_checkin').value  = today;
  document.getElementById('nb_checkout').value = tomorrow;
  document.getElementById('nbError').classList.add('hidden');
  document.getElementById('newBookingModal').classList.remove('hidden');
  calcNewBookingTotal();
}

function closeNewBookingModal() {
  document.getElementById('newBookingModal').classList.add('hidden');
  document.getElementById('newBookingSubmitBtn').disabled = false;
  document.getElementById('newBookingSubmitBtn').textContent = 'Create Booking';
}

['nb_room', 'nb_checkin', 'nb_checkout'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', calcNewBookingTotal);
});

function calcNewBookingTotal() {
  const roomCode = document.getElementById('nb_room').value;
  const cin  = document.getElementById('nb_checkin').value;
  const cout = document.getElementById('nb_checkout').value;
  const box  = document.getElementById('nbTotalBox');
  if (!roomCode || !cin || !cout) { box.classList.add('hidden'); return; }
  const nights = Math.round((new Date(cout) - new Date(cin)) / 86400000);
  if (nights < 1) { box.classList.add('hidden'); return; }
  const room = CAL_ROOMS.find(r => r.code.toLowerCase() === roomCode);
  if (!room) return;
  box.classList.remove('hidden');
  document.getElementById('nbNights').textContent = nights;
  document.getElementById('nbTotal').textContent  = '—';
  document.getElementById('nbPrice').textContent  = '—';
}

document.getElementById('newBookingSubmitBtn').addEventListener('click', async () => {
  const btn = document.getElementById('newBookingSubmitBtn');
  const errEl = document.getElementById('nbError');
  errEl.classList.add('hidden');
  const body = {
    guest_first_name: document.getElementById('nb_first_name').value.trim(),
    guest_last_name:  document.getElementById('nb_last_name').value.trim(),
    guest_email:      document.getElementById('nb_email').value.trim(),
    guest_phone:      document.getElementById('nb_phone').value.trim(),
    guest_country:    document.getElementById('nb_country').value.trim() || 'United Kingdom',
    room_code:        document.getElementById('nb_room').value,
    payment_method:   document.getElementById('nb_payment').value,
    checkin_date:     document.getElementById('nb_checkin').value,
    checkout_date:    document.getElementById('nb_checkout').value,
    adults:           Number(document.getElementById('nb_adults').value) || 1,
    children:         Number(document.getElementById('nb_children').value) || 0,
    special_requests: document.getElementById('nb_requests').value.trim() || null,
    admin_notes:      document.getElementById('nb_notes').value.trim() || null,
  };
  if (!body.guest_first_name || !body.guest_last_name || !body.guest_email || !body.guest_phone) {
    errEl.textContent = 'Please fill in all required guest fields.'; errEl.classList.remove('hidden'); return;
  }
  if (!body.room_code) { errEl.textContent = 'Please select a room.'; errEl.classList.remove('hidden'); return; }
  if (!body.checkin_date || !body.checkout_date) { errEl.textContent = 'Check-in and check-out dates are required.'; errEl.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const { ok, data } = await apiFetch('POST', '/api/admin/bookings', body);
    if (!ok) { errEl.textContent = data.message || 'Failed to create booking.'; errEl.classList.remove('hidden'); return; }
    closeNewBookingModal();
    loadBookings();
    loadStats();
    alert('Booking created! Ref: ' + data.data.ref);
  } catch { errEl.textContent = 'Network error. Please try again.'; errEl.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.textContent = 'Create Booking'; }
});

// ── Edit Booking Notes Modal ──────────────────────────────────
let _editBookingId = null;

document.getElementById('editBookingClose').addEventListener('click',    closeEditBookingModal);
document.getElementById('editBookingCancelBtn').addEventListener('click', closeEditBookingModal);
document.getElementById('editBookingModal').addEventListener('click', e => {
  if (e.target === document.getElementById('editBookingModal')) closeEditBookingModal();
});

function openEditBookingModal(id) {
  _editBookingId = id;
  const b = allBookings.find(x => x.id === id);
  if (!b) return;
  document.getElementById('editBookingRef').textContent       = b.ref;
  document.getElementById('edit_requests').value              = b.special_requests || '';
  document.getElementById('edit_notes').value                 = b.admin_notes || '';
  document.getElementById('editError').classList.add('hidden');
  document.getElementById('editBookingModal').classList.remove('hidden');
}

function closeEditBookingModal() {
  document.getElementById('editBookingModal').classList.add('hidden');
  _editBookingId = null;
}

document.getElementById('editBookingSubmitBtn').addEventListener('click', async () => {
  if (!_editBookingId) return;
  const btn = document.getElementById('editBookingSubmitBtn');
  const errEl = document.getElementById('editError');
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { ok, data } = await apiFetch('PATCH', '/api/admin/bookings/' + _editBookingId + '/notes', {
      admin_notes:      document.getElementById('edit_notes').value.trim(),
      special_requests: document.getElementById('edit_requests').value.trim(),
    });
    if (!ok) { errEl.textContent = data.message || 'Failed to save.'; errEl.classList.remove('hidden'); return; }
    const b = allBookings.find(x => x.id === _editBookingId);
    if (b) {
      b.admin_notes      = document.getElementById('edit_notes').value.trim();
      b.special_requests = document.getElementById('edit_requests').value.trim();
    }
    closeEditBookingModal();
    renderBookings();
  } catch { errEl.textContent = 'Network error.'; errEl.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.textContent = 'Save Notes'; }
});

// ── Availability / Room Blocks ────────────────────────────────
let _blocksData = [];

document.getElementById('refreshBlocks').addEventListener('click', loadAvailability);

function toggleBlockForm() {
  const wrap = document.getElementById('blockFormWrap');
  const isHidden = wrap.classList.contains('hidden');
  wrap.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    const sel = document.getElementById('blk_room');
    if (sel.options.length <= 1) {
      CAL_ROOMS.forEach(r => {
        const o = document.createElement('option');
        o.value = r.code.toLowerCase();
        o.textContent = r.code.toUpperCase() + ' — ' + r.name;
        sel.appendChild(o);
      });
    }
    document.getElementById('blk_from').value   = new Date().toISOString().slice(0, 10);
    document.getElementById('blk_to').value     = '';
    document.getElementById('blk_reason').value = '';
    document.getElementById('blkError').classList.add('hidden');
  }
}

async function loadAvailability() {
  document.getElementById('blocksList').innerHTML = '<div class="table-loading">Loading…</div>';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/blocks');
    if (!ok) return;
    _blocksData = data.data || [];
    renderBlocks();
  } catch {
    document.getElementById('blocksList').innerHTML = '<div class="table-error">Failed to load.</div>';
  }
}

function renderBlocks() {
  if (!_blocksData.length) {
    document.getElementById('blocksList').innerHTML = '<div class="fd-empty">No blocks set — all rooms are available.</div>';
    return;
  }
  document.getElementById('blocksList').innerHTML = _blocksData.map(bl => {
    const room = CAL_ROOMS.find(r => r.code.toLowerCase() === bl.room_code) || { name: bl.room_code.toUpperCase() };
    return '<div class="block-item">'
      + '<div class="block-item-room"><span class="price-card-code" style="background:#0f172a">' + bl.room_code.toUpperCase() + '</span><span class="block-item-name">' + room.name + '</span></div>'
      + '<div class="block-item-dates">' + fmtDate(bl.start_date) + ' → ' + fmtDate(bl.end_date) + '</div>'
      + '<div class="block-item-reason">' + (bl.reason ? esc(bl.reason) : '<span style="color:#94a3b8">No reason given</span>') + '</div>'
      + '<button class="btn-action btn-cancel" onclick="deleteBlock(' + bl.id + ')">Remove</button>'
      + '</div>';
  }).join('');
}

async function submitBlock() {
  const errEl = document.getElementById('blkError');
  errEl.classList.add('hidden');
  const body = {
    room_code:  document.getElementById('blk_room').value,
    start_date: document.getElementById('blk_from').value,
    end_date:   document.getElementById('blk_to').value,
    reason:     document.getElementById('blk_reason').value.trim() || null,
  };
  if (!body.room_code) { errEl.textContent = 'Select a room.'; errEl.classList.remove('hidden'); return; }
  if (!body.start_date || !body.end_date) { errEl.textContent = 'Both dates are required.'; errEl.classList.remove('hidden'); return; }
  if (new Date(body.end_date) <= new Date(body.start_date)) { errEl.textContent = 'End date must be after start date.'; errEl.classList.remove('hidden'); return; }
  try {
    const { ok, data } = await apiFetch('POST', '/api/admin/blocks', body);
    if (!ok) { errEl.textContent = data.message; errEl.classList.remove('hidden'); return; }
    toggleBlockForm();
    loadAvailability();
  } catch { errEl.textContent = 'Network error.'; errEl.classList.remove('hidden'); }
}

async function deleteBlock(id) {
  if (!confirm('Remove this room block?')) return;
  try {
    const { ok, data } = await apiFetch('DELETE', '/api/admin/blocks/' + id);
    if (!ok) { alert(data.message); return; }
    loadAvailability();
  } catch { alert('Failed to remove block.'); }
}

// ── Guests ────────────────────────────────────────────────────
let _allGuests = [];
document.getElementById('refreshGuests').addEventListener('click', loadGuests);

async function loadGuests() {
  document.getElementById('guestsBody').innerHTML = '<tr><td colspan="7" class="table-loading">Loading…</td></tr>';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/guests');
    if (!ok) return;
    _allGuests = data.data || [];
    renderGuests(_allGuests);
  } catch {
    document.getElementById('guestsBody').innerHTML = '<tr><td colspan="7" class="table-error">Failed to load guests.</td></tr>';
  }
}

function filterGuests() {
  const term = (document.getElementById('guestSearch').value || '').toLowerCase();
  const filtered = term
    ? _allGuests.filter(g =>
        (g.guest_first_name + ' ' + g.guest_last_name).toLowerCase().includes(term) ||
        g.guest_email.toLowerCase().includes(term) ||
        (g.guest_country || '').toLowerCase().includes(term))
    : _allGuests;
  renderGuests(filtered);
}

function renderGuests(list) {
  if (!list.length) {
    document.getElementById('guestsBody').innerHTML = '<tr><td colspan="7" class="table-empty">No guests found.</td></tr>';
    return;
  }
  document.getElementById('guestsBody').innerHTML = list.map(g => '<tr>'
    + '<td><strong>' + esc(g.guest_first_name) + ' ' + esc(g.guest_last_name) + '</strong></td>'
    + '<td><a href="mailto:' + esc(g.guest_email) + '">' + esc(g.guest_email) + '</a><br><small>' + esc(g.guest_phone || '—') + '</small></td>'
    + '<td>' + esc(g.guest_country || '—') + '</td>'
    + '<td><span class="ref-badge">' + g.bookings_count + '</span></td>'
    + '<td>£' + Number(g.total_spent).toLocaleString() + '</td>'
    + '<td>' + fmtDate(g.last_booking) + '</td>'
    + '<td><div class="guest-refs">' + (g.refs || []).slice(0, 3).map(r => '<span class="ref-badge ref-badge-sm">' + r + '</span>').join(' ')
    + (g.refs && g.refs.length > 3 ? ' <span style="color:#94a3b8;font-size:11px">+' + (g.refs.length - 3) + ' more</span>' : '')
    + '</div></td>'
    + '</tr>'
  ).join('');
}

// ── Reports ───────────────────────────────────────────────────
document.getElementById('refreshReports').addEventListener('click', loadReports);

async function loadReports() {
  document.getElementById('reportsSummary').innerHTML = '<div class="table-loading">Loading…</div>';
  document.getElementById('revChart').innerHTML       = '<div class="table-loading">Loading…</div>';
  document.getElementById('roomsChart').innerHTML     = '<div class="table-loading">Loading…</div>';
  document.getElementById('paymentsChart').innerHTML  = '<div class="table-loading">Loading…</div>';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/analytics');
    if (!ok) return;
    renderReports(data.data);
  } catch {
    document.getElementById('reportsSummary').innerHTML = '<div class="table-error">Failed to load analytics.</div>';
  }
}

function renderReports(d) {
  const s = d.summary;
  document.getElementById('reportsSummary').innerHTML = [
    { label: 'Total Revenue',     val: '£' + Number(s.total_revenue).toLocaleString(),           cls: 'stat-gold'   },
    { label: 'This Month',        val: '£' + Number(s.this_month_revenue).toLocaleString(),       cls: 'stat-green'  },
    { label: 'Avg Booking Value', val: '£' + Number(s.avg_booking_value).toFixed(0),              cls: 'stat-blue'   },
    { label: 'Avg Stay (nights)', val: Number(s.avg_nights).toFixed(1),                           cls: 'stat-purple' },
    { label: 'Total Bookings',    val: s.total_bookings,                                          cls: 'stat-blue'   },
    { label: 'This Month',        val: s.this_month_bookings + ' bookings',                       cls: 'stat-green'  },
  ].map(x => '<div class="stat-card"><div class="stat-icon ' + x.cls + '"></div><div><p class="stat-label">' + x.label + '</p><p class="stat-value">' + x.val + '</p></div></div>').join('');

  // Monthly revenue bar chart
  const monthly = d.monthly || [];
  if (!monthly.length) {
    document.getElementById('revChart').innerHTML = '<div class="fd-empty">No data yet.</div>';
  } else {
    const maxRev = Math.max(...monthly.map(m => Number(m.revenue)), 1);
    document.getElementById('revChart').innerHTML = '<div class="rev-chart">'
      + monthly.map(m => {
          const pct = Math.round((Number(m.revenue) / maxRev) * 100);
          return '<div class="rev-bar-wrap">'
            + '<div class="rev-bar-label-top">£' + Number(m.revenue).toLocaleString() + '</div>'
            + '<div class="rev-bar-track"><div class="rev-bar-fill" style="height:' + pct + '%"></div></div>'
            + '<div class="rev-bar-label">' + m.label + '</div>'
            + '<div class="rev-bar-count">' + m.bookings + ' bk</div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  // Top rooms
  document.getElementById('roomsChart').innerHTML = (d.rooms || []).map((r, i) => {
    const maxBk = d.rooms[0].bookings || 1;
    const pct = Math.round((r.bookings / maxBk) * 100);
    return '<div class="horiz-bar-row">'
      + '<span class="horiz-bar-label"><span class="price-card-code" style="background:#0f172a;font-size:10px">' + r.room_code.toUpperCase() + '</span> ' + esc(r.room_name) + '</span>'
      + '<div class="horiz-bar-track"><div class="horiz-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<span class="horiz-bar-val">' + r.bookings + '</span>'
      + '</div>';
  }).join('') || '<div class="fd-empty">No data yet.</div>';

  // Payment methods
  const payLabels = { card: 'Card Payment', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  const payColors = { card: '#6366f1', bank: '#0891b2', payathotel: '#059669' };
  document.getElementById('paymentsChart').innerHTML = (d.payments || []).map(p =>
    '<div class="pay-row">'
    + '<span class="pay-dot" style="background:' + (payColors[p.payment_method] || '#94a3b8') + '"></span>'
    + '<span class="pay-label">' + (payLabels[p.payment_method] || p.payment_method) + '</span>'
    + '<span class="pay-count">' + p.count + '</span>'
    + '</div>'
  ).join('') || '<div class="fd-empty">No data yet.</div>';
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (!getToken()) { showLogin(); return; }
  try {
    const { ok } = await apiFetch('GET', '/api/admin/stats');
    if (ok) { showApp(); showSection('dashboard'); }
    else    { clearToken(); showLogin(); }
  } catch { showLogin(); }
}

init();
