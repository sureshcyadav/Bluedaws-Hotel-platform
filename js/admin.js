// ── Config ────────────────────────────────────────────────────
const API = 'https://bluedaws-hotel-platform.onrender.com';

let allBookings = [];
let allContacts = [];
let bookingFilter = 'all';
let contactFilter = 'all';

// ── Calendar state ────────────────────────────────────────────
let calBookings  = [];
let calWeekStart = calGetMonday(new Date());

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
  if (name === 'dashboard') loadStats();
  if (name === 'bookings')  loadBookings();
  if (name === 'calendar')  loadCalendar();
  if (name === 'contacts')  loadContacts();
  if (name === 'content')   loadContent();
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

function renderBookings() {
  const list = bookingFilter === 'all' ? allBookings : allBookings.filter(b => b.status === bookingFilter);
  const tbody = document.getElementById('bookingsBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="table-empty">No bookings found.</td></tr>';
    return;
  }
  const payLabel = { card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  tbody.innerHTML = list.map(b => '<tr>'
    + '<td><span class="ref-badge">' + b.ref + '</span></td>'
    + '<td><strong>' + b.guest_first_name + ' ' + b.guest_last_name + '</strong><br><small>' + b.guest_country + '</small></td>'
    + '<td><a href="mailto:' + b.guest_email + '">' + b.guest_email + '</a><br><small>' + b.guest_phone + '</small></td>'
    + '<td>' + b.room_name + '<br><small>' + b.room_code + '</small></td>'
    + '<td>' + fmtDate(b.checkin_date) + '</td>'
    + '<td>' + fmtDate(b.checkout_date) + '</td>'
    + '<td>' + b.nights + '</td>'
    + '<td>£' + Number(b.total_amount).toLocaleString() + '</td>'
    + '<td>' + (payLabel[b.payment_method] || b.payment_method) + '</td>'
    + '<td><span class="status-badge status-' + b.status + '">' + b.status + '</span></td>'
    + '<td class="actions-cell">'
    + (b.status === 'pending'   ? '<button class="btn-action btn-confirm" onclick="updateBooking(' + b.id + ',\'confirmed\')">Confirm</button>' : '')
    + (b.status !== 'cancelled' ? '<button class="btn-action btn-cancel"  onclick="updateBooking(' + b.id + ',\'cancelled\')">Cancel</button>'  : '')
    + (b.status === 'cancelled' ? '<button class="btn-action btn-restore" onclick="updateBooking(' + b.id + ',\'pending\')">Restore</button>'   : '')
    + '</td></tr>'
  ).join('');
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
  return '<div class="content-block">'
    + '<div class="content-block-header"><h3>Room Prices</h3><p>Price per night in GBP</p></div>'
    + '<div class="content-grid">' + list.map(s => _cfField(s, 'number', '£')).join('') + '</div>'
    + '</div>';
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
    const { ok, data } = await apiFetch('GET', '/api/admin/bookings');
    if (!ok) return;
    calBookings = data.data;
    renderCalendar();
  } catch {
    document.getElementById('calGrid').innerHTML = '<div class="table-error">Failed to load bookings.</div>';
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

  // Range label
  var fmt = function(d, o) { return d.toLocaleDateString('en-GB', o); };
  document.getElementById('calRangeLabel').textContent =
    fmt(days[0], { day:'numeric', month:'short' }) + ' – ' +
    fmt(days[6], { day:'numeric', month:'short', year:'numeric' });

  // Header
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

  // Rows — one per room, wrapped in .cal-body for flex auto-sizing
  html += '<div class="cal-body">';
  CAL_ROOMS.forEach(function(room) {
    var bookings = calBookings.filter(function(b) {
      if (b.room_code.toUpperCase() !== room.code) return false;
      if (b.status === 'cancelled') return false;
      return new Date(b.checkout_date) > calWeekStart && new Date(b.checkin_date) < weekEnd;
    });

    html += '<div class="cal-row">';

    // Room label (sticky left)
    html += '<div class="cal-room-label">'
      + '<strong class="cal-rcode">' + room.code + '</strong>'
      + '<span class="cal-rname">'  + room.name  + '</span>'
      + '</div>';

    // Cells wrapper
    html += '<div class="cal-cells">';

    // Background day cells
    days.forEach(function(d) {
      html += '<div class="cal-cell' + (d.getTime() === today.getTime() ? ' cal-cell-today' : '') + '"></div>';
    });

    // Booking blocks (absolutely positioned)
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

      html += '<div class="cal-block cal-bk-' + b.status + '"'
        + ' style="left:' + left + '%;width:' + width + '%"'
        + ' onclick="openCalBooking(' + b.id + ')"'
        + ' title="' + esc(guestName) + ' · ' + b.ref + '">'
        + '<span class="cal-bk-name">' + esc(guestName) + '</span>'
        + '<span class="cal-bk-ref">' + b.ref + '</span>'
        + '</div>';
    });

    html += '</div></div>'; // end cal-cells, cal-row
  });
  html += '</div>'; // end cal-body

  document.getElementById('calGrid').innerHTML = html;
}

function openCalBooking(id) {
  var b = calBookings.find(function(x) { return x.id === id; });
  if (!b) return;
  var pay = { card:'Card', bank:'Bank Transfer', payathotel:'Pay at Hotel' };
  document.getElementById('modalTitle').textContent =
    b.guest_first_name + ' ' + b.guest_last_name + '  ·  Room ' + b.room_code.toUpperCase();
  document.getElementById('modalBody').innerHTML =
    '<div class="modal-meta">'
    + '<span><strong>Ref:</strong> ' + b.ref + '</span>'
    + '<span><strong>Room:</strong> ' + b.room_name + ' (' + b.room_code.toUpperCase() + ')</span>'
    + '<span><strong>Check-in:</strong> ' + fmtDate(b.checkin_date) + '</span>'
    + '<span><strong>Check-out:</strong> ' + fmtDate(b.checkout_date) + '</span>'
    + '<span><strong>Nights:</strong> ' + b.nights + '</span>'
    + '<span><strong>Guests:</strong> ' + b.adults + ' adult' + (b.adults !== 1 ? 's' : '')
      + (b.children > 0 ? ', ' + b.children + ' child' + (b.children !== 1 ? 'ren' : '') : '') + '</span>'
    + '<span><strong>Total:</strong> £' + Number(b.total_amount).toLocaleString() + '</span>'
    + '<span><strong>Payment:</strong> ' + (pay[b.payment_method] || b.payment_method) + '</span>'
    + '<span><strong>Status:</strong> <span class="status-badge status-' + b.status + '">' + b.status + '</span></span>'
    + (b.special_requests ? '<span><strong>Requests:</strong> ' + esc(b.special_requests) + '</span>' : '')
    + '</div>'
    + (b.status === 'pending'
        ? '<div class="modal-actions">'
          + '<button class="btn-action btn-confirm" onclick="updateBooking(' + b.id + ',\'confirmed\');document.getElementById(\'messageModal\').classList.add(\'hidden\');loadCalendar()">Confirm Booking</button>'
          + '<button class="btn-action btn-cancel"  onclick="updateBooking(' + b.id + ',\'cancelled\');document.getElementById(\'messageModal\').classList.add(\'hidden\');loadCalendar()">Cancel</button>'
          + '</div>'
        : '')
    + (b.status === 'confirmed'
        ? '<div class="modal-actions">'
          + '<button class="btn-action btn-cancel" onclick="updateBooking(' + b.id + ',\'cancelled\');document.getElementById(\'messageModal\').classList.add(\'hidden\');loadCalendar()">Cancel Booking</button>'
          + '</div>'
        : '');
  document.getElementById('messageModal').classList.remove('hidden');
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
