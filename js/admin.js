// ── Config ────────────────────────────────────────────────────
const API = 'https://bluedaws-hotel-platform.onrender.com';

let allBookings = [];
let allContacts = [];
let bookingFilter      = 'all';
let _bookingSortField  = 'created_at';
let _bookingSortDir    = 'desc';
let _lastBookingList   = [];
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
    const td = data.today || { arrivals: [], departures: [], in_house: 0 };
    const TOTAL_ROOMS = 22;

    // ── KPI cards ─────────────────────────────────────────────
    document.getElementById('statTotal').textContent        = b.total;
    document.getElementById('statPending').textContent      = b.pending;
    document.getElementById('statConfirmed').textContent    = b.confirmed;
    document.getElementById('statInHouse').textContent      = td.in_house;
    document.getElementById('statArrivingToday').textContent = td.arrivals.length;
    document.getElementById('statDepartingToday').textContent = td.departures.length;
    document.getElementById('statRevenue').textContent      = '£' + Number(b.revenue).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    var occPct = Math.round(td.in_house / TOTAL_ROOMS * 100);
    document.getElementById('statOccupancy').textContent    = occPct + '%';
    document.getElementById('statUnread').textContent       = c.unread;

    // Nav badges
    document.getElementById('pendingBadge').textContent = +b.pending > 0 ? b.pending : '';
    document.getElementById('unreadBadge').textContent  = +c.unread  > 0 ? c.unread  : '';

    document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── Occupancy bar ──────────────────────────────────────────
    document.getElementById('dashOccFill').style.width = occPct + '%';
    document.getElementById('dashOccPct').textContent  = occPct + '%';
    document.getElementById('dashOccLabel').textContent = td.in_house + ' / ' + TOTAL_ROOMS + ' rooms';

    // ── Arrivals list ──────────────────────────────────────────
    document.getElementById('dashArrCount').textContent = td.arrivals.length;
    if (td.arrivals.length === 0) {
      document.getElementById('dashArrList').innerHTML = '<div class="dash-empty">No arrivals today</div>';
    } else {
      document.getElementById('dashArrList').innerHTML = td.arrivals.map(function(g) {
        var done = g.checked_in_at;
        return '<div class="dash-guest-item' + (done ? ' dash-guest-done' : '') + '" onclick="openCalBooking(' + g.id + ')">'
          + '<div class="dash-guest-avatar">' + esc(g.guest_first_name.charAt(0)) + '</div>'
          + '<div class="dash-guest-info">'
          + '<div class="dash-guest-name">' + esc(g.guest_first_name) + ' ' + esc(g.guest_last_name) + '</div>'
          + '<div class="dash-guest-sub">' + g.room_code.toUpperCase() + ' &middot; ' + esc(g.room_name || '') + '</div>'
          + '</div>'
          + '<div class="dash-guest-status">' + (done ? '<span class="dash-pill-in">Checked In</span>' : '<span class="dash-pill-arr">Due</span>') + '</div>'
          + '</div>';
      }).join('');
    }

    // ── Departures list ────────────────────────────────────────
    document.getElementById('dashDepCount').textContent = td.departures.length;
    if (td.departures.length === 0) {
      document.getElementById('dashDepList').innerHTML = '<div class="dash-empty">No departures today</div>';
    } else {
      document.getElementById('dashDepList').innerHTML = td.departures.map(function(g) {
        return '<div class="dash-guest-item" onclick="openCalBooking(' + g.id + ')">'
          + '<div class="dash-guest-avatar dash-avatar-dep">' + esc(g.guest_first_name.charAt(0)) + '</div>'
          + '<div class="dash-guest-info">'
          + '<div class="dash-guest-name">' + esc(g.guest_first_name) + ' ' + esc(g.guest_last_name) + '</div>'
          + '<div class="dash-guest-sub">' + g.room_code.toUpperCase() + ' &middot; ' + esc(g.room_name || '') + '</div>'
          + '</div>'
          + '<div class="dash-guest-status"><span class="dash-pill-dep">Departing</span></div>'
          + '</div>';
      }).join('');
    }

    // ── Upcoming 7 days ────────────────────────────────────────
    var upcoming = data.upcoming || [];
    if (upcoming.length === 0) {
      document.getElementById('dashUpcoming').innerHTML = '<div class="dash-empty">Nothing in the next 7 days</div>';
    } else {
      document.getElementById('dashUpcoming').innerHTML = upcoming.map(function(g) {
        var cin = fmtDate(g.checkin_date);
        var cout = fmtDate(g.checkout_date);
        var nights = Math.round((new Date(g.checkout_date) - new Date(g.checkin_date)) / 86400000);
        return '<div class="dash-upcoming-item" onclick="openCalBooking(' + g.id + ')">'
          + '<div class="dash-upc-date">' + cin + '</div>'
          + '<div class="dash-upc-info">'
          + '<div class="dash-upc-name">' + esc(g.guest_first_name) + ' ' + esc(g.guest_last_name) + '</div>'
          + '<div class="dash-upc-sub">' + g.room_code.toUpperCase() + ' &middot; ' + nights + 'n &middot; ' + g.adults + ' guest' + (g.adults !== 1 ? 's' : '') + '</div>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    // ── Load today's todo ──────────────────────────────────────
    dashLoadTodo();

  } catch(e) { console.error('loadStats', e); }
}

// ── Daily To-Do (localStorage) ────────────────────────────────
var _dashTodoKey = 'bdw_todo_' + new Date().toISOString().slice(0, 10);

function dashGetData() {
  try { return JSON.parse(localStorage.getItem(_dashTodoKey)) || { tasks: [], note: '' }; }
  catch { return { tasks: [], note: '' }; }
}
function dashSetData(d) { localStorage.setItem(_dashTodoKey, JSON.stringify(d)); }

function dashLoadTodo() {
  var today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  var el = document.getElementById('dashTodoDate');
  if (el) el.textContent = today;
  var d = dashGetData();
  document.getElementById('dashTodoNote').value = d.note || '';
  dashRenderTasks(d.tasks);
}

function dashRenderTasks(tasks) {
  var el = document.getElementById('dashTodoList');
  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<div class="dash-empty">No tasks yet — add one above</div>';
    return;
  }
  el.innerHTML = tasks.map(function(t, i) {
    return '<div class="dash-todo-item' + (t.done ? ' dash-todo-done' : '') + '">'
      + '<label class="dash-todo-check-wrap">'
      + '<input type="checkbox" class="dash-todo-check"' + (t.done ? ' checked' : '') + ' onchange="dashToggleTask(' + i + ')">'
      + '<span class="dash-todo-text">' + esc(t.text) + '</span>'
      + '</label>'
      + '<button class="dash-todo-del" onclick="dashDeleteTask(' + i + ')" title="Remove">&#x2715;</button>'
      + '</div>';
  }).join('');
}

function dashAddTask() {
  var inp = document.getElementById('dashTodoInput');
  var text = (inp.value || '').trim();
  if (!text) return;
  var d = dashGetData();
  d.tasks.push({ text: text, done: false });
  dashSetData(d);
  inp.value = '';
  dashRenderTasks(d.tasks);
  inp.focus();
}

function dashToggleTask(i) {
  var d = dashGetData();
  if (d.tasks[i]) d.tasks[i].done = !d.tasks[i].done;
  dashSetData(d);
  dashRenderTasks(d.tasks);
}

function dashDeleteTask(i) {
  var d = dashGetData();
  d.tasks.splice(i, 1);
  dashSetData(d);
  dashRenderTasks(d.tasks);
}

var _dashNoteSaveTimer = null;
function dashSaveNote() {
  clearTimeout(_dashNoteSaveTimer);
  _dashNoteSaveTimer = setTimeout(function() {
    var d = dashGetData();
    d.note = document.getElementById('dashTodoNote').value;
    dashSetData(d);
    var saved = document.getElementById('dashNoteSaved');
    if (saved) {
      saved.classList.remove('hidden');
      setTimeout(function() { saved.classList.add('hidden'); }, 2000);
    }
  }, 600);
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
  // ── Filter ────────────────────────────────────────────────────
  let list;
  if (bookingFilter === 'all')        list = allBookings.slice();
  else if (bookingFilter === 'checkedin')  list = allBookings.filter(b => b.checked_in_at && !b.checked_out_at);
  else if (bookingFilter === 'checkedout') list = allBookings.filter(b => !!b.checked_out_at);
  else                                list = allBookings.filter(b => b.status === bookingFilter);

  if (_bookingSearchTerm) {
    list = list.filter(b =>
      (b.guest_first_name + ' ' + b.guest_last_name).toLowerCase().includes(_bookingSearchTerm) ||
      b.guest_email.toLowerCase().includes(_bookingSearchTerm) ||
      b.ref.toLowerCase().includes(_bookingSearchTerm) ||
      b.room_code.toLowerCase().includes(_bookingSearchTerm) ||
      b.room_name.toLowerCase().includes(_bookingSearchTerm)
    );
  }

  // ── Sort ──────────────────────────────────────────────────────
  list.sort(function(a, b) {
    var va, vb;
    if (_bookingSortField === 'guest_name') {
      va = (a.guest_first_name + ' ' + a.guest_last_name).toLowerCase();
      vb = (b.guest_first_name + ' ' + b.guest_last_name).toLowerCase();
    } else if (_bookingSortField === 'total_amount' || _bookingSortField === 'nights') {
      va = Number(a[_bookingSortField]) || 0;
      vb = Number(b[_bookingSortField]) || 0;
    } else {
      va = (a[_bookingSortField] || '').toString();
      vb = (b[_bookingSortField] || '').toString();
    }
    if (va < vb) return _bookingSortDir === 'asc' ? -1 : 1;
    if (va > vb) return _bookingSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Store for PDF export
  _lastBookingList = list;

  // Update result count
  var countEl = document.getElementById('bkResultsCount');
  if (countEl) countEl.textContent = list.length + ' booking' + (list.length !== 1 ? 's' : '');

  // ── Render table ──────────────────────────────────────────────
  const tbody = document.getElementById('bookingsBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="table-empty">No bookings found.</td></tr>';
    return;
  }
  const payLabel = { card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  tbody.innerHTML = list.map(b => {
    const checkedIn  = !!b.checked_in_at;
    const checkedOut = !!b.checked_out_at;
    let statusHtml = '<span class="status-badge status-' + b.status + '">'
      + b.status.charAt(0).toUpperCase() + b.status.slice(1) + '</span>';
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

// ── Sort bar ─────────────────────────────────────────────────
document.getElementById('bkSortBar').addEventListener('click', function(e) {
  var chip = e.target.closest('.bk-sort-chip');
  if (!chip) return;
  var field = chip.dataset.sort;
  if (_bookingSortField === field) {
    _bookingSortDir = _bookingSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _bookingSortField = field;
    _bookingSortDir = (field === 'guest_name') ? 'asc' : 'desc';
  }
  document.querySelectorAll('#bkSortBar .bk-sort-chip').forEach(function(c) {
    c.classList.remove('active');
    c.querySelector('.bk-arr').textContent = '';
  });
  chip.classList.add('active');
  chip.querySelector('.bk-arr').textContent = _bookingSortDir === 'asc' ? '↑' : '↓';
  renderBookings();
});

// ── Bookings PDF export ───────────────────────────────────────
function downloadBookingsPDF() {
  if (!_lastBookingList || !_lastBookingList.length) {
    alert('No bookings to export.'); return;
  }
  var list  = _lastBookingList;
  var today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  var filterNames = {
    all: 'All Bookings', pending: 'Pending Bookings', confirmed: 'Confirmed Bookings',
    checkedin: 'In-House Guests', checkedout: 'Checked Out', cancelled: 'Cancelled Bookings',
  };
  var sortNames = {
    created_at: 'Booked On', checkin_date: 'Check-in Date', checkout_date: 'Check-out Date',
    guest_name: 'Guest Name', total_amount: 'Total Amount', nights: 'Nights',
  };
  var filterName = filterNames[bookingFilter] || 'Bookings';
  var sortName   = sortNames[_bookingSortField] || _bookingSortField;
  var dirLabel   = _bookingSortDir === 'asc' ? 'A → Z' : 'Z → A';

  var payLabel = { card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  var totalRev = list.reduce(function(s, b) {
    return s + (b.status !== 'cancelled' ? Number(b.total_amount) : 0);
  }, 0);

  var rows = list.map(function(b) {
    var statusText  = b.status.charAt(0).toUpperCase() + b.status.slice(1);
    if (b.checked_in_at && !b.checked_out_at) statusText += ' / In House';
    else if (b.checked_out_at) statusText += ' / Out';
    var statusColor = b.status === 'confirmed' ? '#16a34a' : b.status === 'pending' ? '#d97706' : '#94a3b8';
    var paidLabel   = b.payment_status === 'paid' ? ' ✓' : b.payment_status === 'partial' ? ' (part)' : '';
    return '<tr style="border-bottom:1px solid #f1f5f9">'
      + '<td style="padding:7px 8px;font-size:10px;font-family:monospace;font-weight:700;white-space:nowrap;color:#0f172a">' + esc(b.ref) + '</td>'
      + '<td style="padding:7px 8px;font-size:11px;font-weight:600;color:#0f172a">' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</td>'
      + '<td style="padding:7px 8px;font-size:10.5px;color:#475569">' + esc(b.room_name) + ' <span style="font-family:monospace;font-size:9.5px">' + b.room_code.toUpperCase() + '</span></td>'
      + '<td style="padding:7px 8px;font-size:10.5px;color:#334155;white-space:nowrap">' + fmtDate(b.checkin_date) + '</td>'
      + '<td style="padding:7px 8px;font-size:10.5px;color:#334155;white-space:nowrap">' + fmtDate(b.checkout_date) + '</td>'
      + '<td style="padding:7px 8px;font-size:10.5px;text-align:center;color:#334155">' + b.nights + '</td>'
      + '<td style="padding:7px 8px;font-size:11px;font-weight:700;text-align:right;color:#0f172a">&pound;' + Number(b.total_amount).toLocaleString() + '</td>'
      + '<td style="padding:7px 8px;font-size:10px;color:#475569">' + (payLabel[b.payment_method] || b.payment_method || '—') + paidLabel + '</td>'
      + '<td style="padding:7px 8px;font-size:10.5px;font-weight:700;color:' + statusColor + '">' + statusText + '</td>'
      + '</tr>';
  }).join('');

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#fff;padding:0;width:1050px">'

    // Dark header
    + '<div style="background:#0f172a;padding:18px 28px">'
    + '<table style="width:100%;border-collapse:collapse"><tr>'
    + '<td style="vertical-align:top">'
    + '<div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a96e;margin-bottom:2px">PRIVATE HOTEL &middot; LONDON</div>'
    + '<div style="font-size:18px;font-weight:900;color:#fff">BLUEDAWS</div>'
    + '</td>'
    + '<td style="text-align:right;vertical-align:top">'
    + '<div style="font-size:13px;font-weight:800;color:#fff">' + filterName + '</div>'
    + '<div style="font-size:10px;color:#94a3b8;margin-top:3px">Generated: ' + today + ' &middot; Sorted by ' + sortName + ' (' + dirLabel + ') &middot; ' + list.length + ' records</div>'
    + '</td></tr></table></div>'
    + '<div style="height:3px;background:#c9a96e"></div>'

    // Table
    + '<div style="padding:16px 28px">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:#0f172a">'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">REF</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">GUEST</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">ROOM</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">CHECK-IN</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">CHECK-OUT</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:center;color:#fff">NTS</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:right;color:#fff">TOTAL</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">PAYMENT</th>'
    + '<th style="padding:8px;font-size:9px;font-weight:700;text-align:left;color:#fff">STATUS</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'

    // Footer totals
    + '<div style="margin-top:14px;padding-top:12px;border-top:2px solid #0f172a;display:flex;justify-content:space-between;align-items:center">'
    + '<div style="font-size:10.5px;color:#64748b">' + list.length + ' record' + (list.length !== 1 ? 's' : '') + ' &middot; ' + filterName + '</div>'
    + '<div style="font-size:14px;font-weight:800;color:#0f172a">Total Revenue: &pound;' + totalRev.toLocaleString('en-GB') + '</div>'
    + '</div>'
    + '</div></div>';

  var filename = 'Bookings-' + filterName.replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
  _runPDF(html, filename, 'bkExportBtn', '&#x2B07; Export PDF', { orientation: 'landscape', width: 1050 });
}

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

// ── Shared PDF renderer ───────────────────────────────────────
// Creates a fresh off-screen container (no z-index tricks that block
// html2canvas), loads html2pdf on-demand if not yet available, then
// downloads the result and cleans up.
function _runPDF(html, filename, btnId, btnLabel, opts) {
  var btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  var orientation = (opts && opts.orientation) || 'portrait';
  var pageWidth   = (opts && opts.width)       || 730;

  function doRender() {
    // Fresh container appended to body — visible to html2canvas
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + pageWidth + 'px;background:#fff;overflow:visible;z-index:0';
    document.body.appendChild(wrap);
    wrap.innerHTML = html;

    html2pdf().set({
      margin:      0,
      filename:    filename,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false,
                     backgroundColor: '#ffffff', windowWidth: pageWidth },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: orientation }
    }).from(wrap.firstElementChild).save()
      .then(function() {
        document.body.removeChild(wrap);
        if (btn) { btn.disabled = false; btn.innerHTML = btnLabel; }
      })
      .catch(function(err) {
        console.error('[PDF]', err);
        document.body.removeChild(wrap);
        if (btn) { btn.disabled = false; btn.innerHTML = btnLabel; }
        alert('PDF generation failed. Please try again.');
      });
  }

  if (typeof html2pdf !== 'undefined') {
    doRender();
  } else {
    // Library not loaded yet — load it now, then render
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload  = doRender;
    s.onerror = function() {
      if (btn) { btn.disabled = false; btn.innerHTML = btnLabel; }
      alert('Could not load PDF library. Please check your internet connection and try again.');
    };
    document.head.appendChild(s);
  }
}

// ── Invoice PDF ───────────────────────────────────────────────
function generateInvoicePDF() {
  if (!_calCurrentBookingId) return;
  var b = calBookings.find(function(x) { return x.id === _calCurrentBookingId; });
  if (!b) b = allBookings.find(function(x) { return x.id === _calCurrentBookingId; });
  if (!b) { alert('Booking data not found. Please reopen the profile.'); return; }

  // ── Numbers ──────────────────────────────────────────────────
  var totalAmt = Number(b.total_amount) || 0;
  var vatAmt   = Math.round(totalAmt * 20 / 120 * 100) / 100;
  var netAmt   = Math.round((totalAmt - vatAmt) * 100) / 100;
  var paidAmt  = Number(b.amount_paid) || 0;
  var balance  = Math.max(0, Math.round((totalAmt - paidAmt) * 100) / 100);
  var nights   = Number(b.nights) || 1;
  var ppnNet   = netAmt / nights;

  var f2 = function(n) {
    return Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // ── Labels ───────────────────────────────────────────────────
  var today    = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  var adults   = Number(b.adults) || 1;
  var children = Number(b.children) || 0;
  var gStr     = adults + ' adult' + (adults !== 1 ? 's' : '') +
                 (children > 0 ? ', ' + children + ' child' + (children > 1 ? 'ren' : '') : '');

  var psLabels  = { paid: 'Fully Paid', partial: 'Partially Paid', unpaid: 'Unpaid' };
  var psColors  = { paid: '#059669', partial: '#d97706', unpaid: '#dc2626' };
  var pStatus   = b.payment_status || 'unpaid';
  var modeLabel = b.payment_mode ||
    ({ card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' }[b.payment_method] || '—');
  var payNote  = b.payment_note ? esc(b.payment_note) : '—';
  var gName    = esc(b.guest_first_name) + ' ' + esc(b.guest_last_name);
  var roomStr  = esc(b.room_name || b.room_code.toUpperCase());
  var cinStr   = fmtDate(b.checkin_date);
  var coutStr  = fmtDate(b.checkout_date);
  var balStr   = balance > 0 ? '£' + f2(balance) : '£' + '0.00 — Settled';
  var balColor = balance > 0 ? '#dc2626' : '#059669';
  var gPhone   = b.guest_phone   ? esc(b.guest_phone) + '<br>' : '';
  var gCountry = b.guest_country ? esc(b.guest_country) : '';

  // ── Invoice HTML (all inline styles — html2pdf renders from DOM) ─
  var html = '<div id="bdw-invoice" style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;width:710px;margin:0;padding:0">'

  /* ── Header ── */
  + '<div style="padding:36px 44px 16px">'
  + '<table style="width:100%;border-collapse:collapse"><tr>'
  + '<td style="vertical-align:top">'
  + '<div style="font-size:9px;font-weight:700;letter-spacing:2px;color:#c9a96e;margin-bottom:4px">PRIVATE HOTEL &middot; LONDON</div>'
  + '<div style="font-size:26px;font-weight:900;color:#0f172a">BLUEDAWS</div>'
  + '<div style="font-size:11px;color:#64748b;line-height:1.8;margin-top:7px">'
  + '133-135 Sussex Gardens, Hyde Park<br>London, W2 2RX, United Kingdom<br>'
  + 'Tel: 034556846892<br>bluedawsprivatehotel@gmail.com</div>'
  + '</td>'
  + '<td style="vertical-align:top;text-align:right">'
  + '<div style="font-size:34px;font-weight:900;color:#0f172a;letter-spacing:-1px">INVOICE</div>'
  + '<div style="font-size:11.5px;color:#94a3b8;margin-top:8px;line-height:1.9">'
  + 'Invoice No: <strong style="color:#334155">' + esc(b.ref) + '</strong><br>'
  + 'Date: <strong style="color:#334155">' + today + '</strong><br>'
  + 'VAT Reg: <strong style="color:#334155">730 124 6692</strong></div>'
  + '</td></tr></table></div>'

  /* ── Gold bar ── */
  + '<div style="height:4px;background:#c9a96e;margin:0 44px"></div>'

  /* ── Bill To / Stay ── */
  + '<div style="padding:0 44px"><table style="width:100%;border-collapse:collapse"><tr>'
  + '<td style="vertical-align:top;padding:20px 20px 16px 0;width:50%">'
  + '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#c9a96e;margin-bottom:8px">BILL TO</div>'
  + '<div style="font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px">' + gName + '</div>'
  + '<div style="font-size:12px;color:#475569;line-height:1.7">' + esc(b.guest_email) + '<br>' + gPhone + gCountry + '</div>'
  + '<div style="margin-top:7px;font-size:11px;font-family:monospace;background:#f1f5f9;color:#334155;padding:3px 10px;border-radius:4px">' + esc(b.ref) + '</div>'
  + '</td>'
  + '<td style="vertical-align:top;padding:20px 0 16px 20px;width:50%">'
  + '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#c9a96e;margin-bottom:8px">STAY DETAILS</div>'
  + '<div style="font-size:13px;color:#334155;line-height:1.8">'
  + '<strong>' + roomStr + '</strong><br>'
  + 'Check-in: ' + cinStr + '<br>Check-out: ' + coutStr + '<br>'
  + nights + ' night' + (nights !== 1 ? 's' : '') + ' &middot; ' + gStr + '</div>'
  + '</td></tr></table></div>'

  /* ── Thin divider ── */
  + '<div style="height:1px;background:#e2e8f0;margin:0 44px"></div>'

  /* ── Line items ── */
  + '<div style="padding:16px 44px 0"><table style="width:100%;border-collapse:collapse">'
  + '<thead><tr style="background:#0f172a">'
  + '<th style="color:#fff;padding:10px 14px;font-size:10px;text-align:left;font-weight:600;letter-spacing:0.5px">DESCRIPTION</th>'
  + '<th style="color:#fff;padding:10px 14px;font-size:10px;text-align:center;font-weight:600;width:70px">NIGHTS</th>'
  + '<th style="color:#fff;padding:10px 14px;font-size:10px;text-align:right;font-weight:600;width:110px">RATE/NIGHT</th>'
  + '<th style="color:#fff;padding:10px 14px;font-size:10px;text-align:right;font-weight:600;width:110px">AMOUNT</th>'
  + '</tr></thead>'
  + '<tbody><tr>'
  + '<td style="padding:13px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top">'
  + '<div style="font-weight:700;color:#0f172a;font-size:13px">' + roomStr + '</div>'
  + '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + cinStr + ' to ' + coutStr + '</div>'
  + '</td>'
  + '<td style="padding:13px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:#0f172a">' + nights + '</td>'
  + '<td style="padding:13px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a">&pound;' + f2(ppnNet) + '</td>'
  + '<td style="padding:13px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a">&pound;' + f2(netAmt) + '</td>'
  + '</tr></tbody></table></div>'

  /* ── Totals ── */
  + '<div style="padding:0 44px"><table style="margin-left:auto;border-collapse:collapse;width:280px">'
  + '<tr><td style="padding:7px 14px;font-size:13px;color:#475569">Subtotal (exc. VAT)</td>'
  + '<td style="padding:7px 14px;font-size:13px;text-align:right;font-weight:600;color:#0f172a">&pound;' + f2(netAmt) + '</td></tr>'
  + '<tr><td style="padding:7px 14px;font-size:13px;color:#475569">VAT @ 20%</td>'
  + '<td style="padding:7px 14px;font-size:13px;text-align:right;font-weight:600;color:#0f172a">&pound;' + f2(vatAmt) + '</td></tr>'
  + '<tr style="border-top:2px solid #0f172a">'
  + '<td style="padding:10px 14px;font-size:16px;font-weight:800;color:#0f172a">Total</td>'
  + '<td style="padding:10px 14px;font-size:16px;font-weight:800;text-align:right;color:#0f172a">&pound;' + f2(totalAmt) + '</td>'
  + '</tr></table>'
  + '<div style="text-align:right;font-size:10px;color:#94a3b8;margin:6px 0 20px">Prices include VAT at 20% &middot; VAT Registration No: 730 124 6692</div></div>'

  /* ── Payment box ── */
  + '<div style="margin:0 44px 28px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:18px 20px">'
  + '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#c9a96e;margin-bottom:14px">PAYMENT DETAILS</div>'
  + '<table style="width:100%;border-collapse:collapse"><tr>'
  + '<td style="width:25%;vertical-align:top;padding-right:10px">'
  + '<div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:4px">STATUS</div>'
  + '<div style="font-size:13px;font-weight:700;color:' + (psColors[pStatus] || '#dc2626') + '">' + (psLabels[pStatus] || 'Unpaid') + '</div>'
  + '</td>'
  + '<td style="width:25%;vertical-align:top;padding-right:10px">'
  + '<div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:4px">RECEIVED</div>'
  + '<div style="font-size:13px;font-weight:700;color:#0f172a">&pound;' + f2(paidAmt) + '</div>'
  + '</td>'
  + '<td style="width:25%;vertical-align:top;padding-right:10px">'
  + '<div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:4px">METHOD</div>'
  + '<div style="font-size:13px;font-weight:700;color:#0f172a">' + esc(modeLabel) + '</div>'
  + '</td>'
  + '<td style="width:25%;vertical-align:top">'
  + '<div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:4px">NOTE</div>'
  + '<div style="font-size:12px;font-weight:500;color:#0f172a">' + payNote + '</div>'
  + '</td></tr></table>'
  + '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0">'
  + '<table style="width:100%;border-collapse:collapse"><tr>'
  + '<td style="font-size:13px;color:#475569;font-weight:600">Balance Due</td>'
  + '<td style="text-align:right;font-size:18px;font-weight:900;color:' + balColor + '">' + balStr + '</td>'
  + '</tr></table></div></div>'

  /* ── Footer ── */
  + '<div style="background:#0f172a;padding:22px 44px;text-align:center">'
  + '<div style="font-size:13px;font-weight:700;color:#c9a96e;margin-bottom:6px">Thank you for staying at Bluedaws Private Hotel</div>'
  + '<div style="font-size:11px;color:#94a3b8;line-height:1.7">'
  + '133-135 Sussex Gardens, Hyde Park, London, W2 2RX<br>'
  + 'Tel: 034556846892 &middot; bluedawsprivatehotel@gmail.com &middot; VAT Reg: 730 124 6692'
  + '</div></div>'
  + '</div>';

  _runPDF(html, 'Invoice-' + b.ref + '.pdf', 'bpInvoiceBtn', '&#x2B07; Download Invoice PDF');
}

// ── Registration Card PDF ─────────────────────────────────────
function generateRegCard() {
  if (!_calCurrentBookingId) return;
  var b = calBookings.find(function(x) { return x.id === _calCurrentBookingId; });
  if (!b) b = allBookings.find(function(x) { return x.id === _calCurrentBookingId; });
  if (!b) { alert('Booking data not found. Please reopen the profile.'); return; }

  var f2 = function(n) {
    return Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var today  = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  var nights = Number(b.nights) || 1;
  var adults = Number(b.adults) || 1;
  var children = Number(b.children) || 0;
  var gStr   = adults + ' adult' + (adults !== 1 ? 's' : '') +
               (children > 0 ? ' + ' + children + ' child' + (children > 1 ? 'ren' : '') : '');
  var totalAmt = Number(b.total_amount) || 0;
  var ppn      = Number(b.price_per_night) || (totalAmt / nights);

  var psLabel = { paid: 'Fully Paid', partial: 'Partially Paid', unpaid: 'Unpaid' };
  var pStatus = b.payment_status || 'unpaid';
  var modeLabel = b.payment_mode ||
    ({ card: 'Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' }[b.payment_method] || '—');

  var fld = function(v) { return v ? esc(String(v)) : '<span style="color:#94a3b8">—</span>'; };
  var cinAt = b.checked_in_at
    ? new Date(b.checked_in_at).toLocaleDateString('en-GB') + ' ' +
      new Date(b.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  /* ── Section helper ── */
  var sec = function(title, rows) {
    var inner = rows.map(function(row) {
      return '<tr>' + row.map(function(c) {
        return '<td style="vertical-align:top;padding:0 20px 10px 0;width:' + Math.round(100 / row.length) + '%">'
          + '<div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:2px">' + c[0] + '</div>'
          + '<div style="font-size:13px;font-weight:700;color:#0f172a">' + c[1] + '</div>'
          + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:15px 18px;margin-bottom:14px">'
      + '<div style="font-size:8px;font-weight:700;letter-spacing:1.8px;color:#c9a96e;margin-bottom:12px">' + title + '</div>'
      + '<table style="width:100%;border-collapse:collapse">' + inner + '</table>'
      + '</div>';
  };

  var html =
    '<div id="bdw-regcard" style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;width:710px;margin:0;padding:0">'

    /* ── Dark header ── */
    + '<div style="background:#0f172a;padding:22px 36px">'
    + '<table style="width:100%;border-collapse:collapse"><tr>'
    + '<td style="vertical-align:top">'
    + '<div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a96e;margin-bottom:3px">PRIVATE HOTEL · LONDON</div>'
    + '<div style="font-size:22px;font-weight:900;color:#fff">BLUEDAWS</div>'
    + '<div style="font-size:10px;color:#94a3b8;line-height:1.75;margin-top:5px">'
    + '133-135 Sussex Gardens, Hyde Park, London W2 2RX<br>'
    + 'Tel: 034556846892 · bluedawsprivatehotel@gmail.com</div>'
    + '</td>'
    + '<td style="vertical-align:top;text-align:right">'
    + '<div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a96e;margin-bottom:6px">HOTEL REGISTRATION CARD</div>'
    + '<div style="font-size:11px;color:#94a3b8;line-height:1.9">'
    + 'Ref: <strong style="color:#e2e8f0">' + esc(b.ref) + '</strong><br>'
    + 'Printed: <strong style="color:#e2e8f0">' + today + '</strong></div>'
    + '</td></tr></table></div>'

    /* ── Gold bar ── */
    + '<div style="height:4px;background:#c9a96e"></div>'

    /* ── Body ── */
    + '<div style="padding:22px 36px">'

    /* Stay details — shaded background */
    + '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:15px 18px;margin-bottom:14px">'
    + '<div style="font-size:8px;font-weight:700;letter-spacing:1.8px;color:#c9a96e;margin-bottom:12px">STAY DETAILS</div>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr>'
    + '<td style="vertical-align:top;padding:0 20px 10px 0;width:50%"><div style="font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px">ROOM</div><div style="font-size:15px;font-weight:900;color:#0f172a">' + b.room_code.toUpperCase() + ' &ndash; ' + esc(b.room_name || '') + '</div></td>'
    + '<td style="vertical-align:top;padding:0 0 10px 0;width:50%"><div style="font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px">BOOKING REFERENCE</div><div style="font-size:14px;font-weight:800;color:#0f172a;font-family:monospace">' + esc(b.ref) + '</div></td>'
    + '</tr>'
    + '<tr>'
    + '<td style="vertical-align:top;padding:0 20px 10px 0"><div style="font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px">CHECK-IN DATE</div><div style="font-size:13px;font-weight:700;color:#0f172a">' + fmtDate(b.checkin_date) + '</div></td>'
    + '<td style="vertical-align:top;padding:0 0 10px 0"><div style="font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px">CHECK-OUT DATE</div><div style="font-size:13px;font-weight:700;color:#0f172a">' + fmtDate(b.checkout_date) + '</div></td>'
    + '</tr>'
    + '<tr>'
    + '<td style="vertical-align:top;padding:0 20px 0 0"><div style="font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px">DURATION</div><div style="font-size:13px;font-weight:700;color:#0f172a">' + nights + ' night' + (nights !== 1 ? 's' : '') + '</div></td>'
    + '<td style="vertical-align:top;padding:0"><div style="font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px">GUESTS</div><div style="font-size:13px;font-weight:700;color:#0f172a">' + gStr + '</div></td>'
    + '</tr>'
    + '</table></div>'

    /* Guest details */
    + sec('GUEST DETAILS', [
        [ ['FULL NAME', esc(b.guest_first_name) + ' ' + esc(b.guest_last_name)],
          ['DATE OF BIRTH', b.guest_dob ? fmtDate(b.guest_dob) : '<span style="color:#94a3b8">—</span>'] ],
        [ ['NATIONALITY', fld(b.guest_nationality)],
          ['COUNTRY OF RESIDENCE', fld(b.guest_country)] ],
        [ ['EMAIL ADDRESS', fld(b.guest_email)],
          ['PHONE NUMBER', fld(b.guest_phone)] ],
      ])

    /* Identity */
    + sec('IDENTITY DOCUMENT', [
        [ ['ID TYPE', fld(b.guest_id_type)],
          ['ID / PASSPORT NUMBER', '<span style="font-family:monospace;letter-spacing:0.5px">' + fld(b.guest_id_number) + '</span>'] ],
      ])

    /* Payment */
    + sec('PAYMENT', [
        [ ['RATE PER NIGHT (INC. VAT)', '&pound;' + f2(ppn)],
          ['TOTAL AMOUNT', '&pound;' + f2(totalAmt)],
          ['PAYMENT STATUS', psLabel[pStatus] || 'Unpaid'] ],
        [ ['PAYMENT METHOD', fld(modeLabel)],
          ['AMOUNT RECEIVED', '&pound;' + f2(Number(b.amount_paid) || 0)],
          ['PAYMENT NOTE', fld(b.payment_note)] ],
      ])

    /* Special requests (only if present) */
    + (b.special_requests
        ? '<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:14px">'
          + '<div style="font-size:8px;font-weight:700;letter-spacing:1.8px;color:#c9a96e;margin-bottom:8px">SPECIAL REQUESTS / NOTES</div>'
          + '<div style="font-size:12px;color:#334155;line-height:1.6">' + esc(b.special_requests) + '</div>'
          + '</div>'
        : '')

    /* Declaration + signature boxes */
    + '<div style="border:1.5px solid #0f172a;border-radius:8px;padding:15px 18px;margin-bottom:0;background:#f8fafc">'
    + '<div style="font-size:8px;font-weight:700;letter-spacing:1.8px;color:#0f172a;margin-bottom:8px">GUEST DECLARATION</div>'
    + '<div style="font-size:10.5px;color:#475569;line-height:1.65;margin-bottom:18px">'
    + 'I confirm that all details provided are true and correct. I agree to abide by the terms and conditions of Bluedaws Private Hotel, '
    + 'including payment of all charges incurred during my stay. I acknowledge that the hotel may retain a copy of my identification '
    + 'document in accordance with UK law.'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr>'
    + '<td style="width:45%;vertical-align:bottom;padding-right:20px">'
    + '<div style="height:38px"></div>'
    + '<div style="border-bottom:1.5px solid #0f172a;margin-bottom:4px"></div>'
    + '<div style="font-size:9px;color:#64748b;font-weight:700">GUEST SIGNATURE</div>'
    + '</td>'
    + '<td style="width:25%;vertical-align:bottom;padding-right:20px">'
    + '<div style="height:38px"></div>'
    + '<div style="border-bottom:1.5px solid #0f172a;margin-bottom:4px"></div>'
    + '<div style="font-size:9px;color:#64748b;font-weight:700">DATE</div>'
    + '</td>'
    + '<td style="width:30%;vertical-align:bottom">'
    + '<div style="height:38px;display:flex;align-items:flex-end;padding-bottom:4px">'
    + '<span style="font-size:11.5px;font-weight:700;color:#0f172a">' + cinAt + '</span>'
    + '</div>'
    + '<div style="border-bottom:1.5px solid #0f172a;margin-bottom:4px"></div>'
    + '<div style="font-size:9px;color:#64748b;font-weight:700">CHECKED IN BY (STAFF)</div>'
    + '</td>'
    + '</tr></table>'
    + '</div>'

    + '</div>' /* end body padding */

    /* Footer */
    + '<div style="background:#0f172a;padding:13px 36px;text-align:center;margin-top:4px">'
    + '<div style="font-size:10.5px;color:#94a3b8">'
    + 'Bluedaws Private Hotel &middot; 133-135 Sussex Gardens, Hyde Park, London W2 2RX'
    + ' &middot; VAT Reg: 730 124 6692'
    + '</div>'
    + '</div>'
    + '</div>'; /* end bdw-regcard */

  _runPDF(html, 'RegCard-' + b.ref + '.pdf', 'bpRegCardBtn', '&#x1F4CB; Registration Card PDF');
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
// ── Reports tab switching ─────────────────────────────────────
document.getElementById('refreshReports').addEventListener('click', function() {
  if (document.getElementById('rptEod').classList.contains('hidden')) loadReports();
  else loadEod();
});

document.querySelectorAll('.rpt-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.rpt-tab').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var tab = btn.dataset.rpt;
    document.getElementById('rptOverview').classList.toggle('hidden', tab !== 'overview');
    document.getElementById('rptEod').classList.toggle('hidden', tab !== 'eod');
    if (tab === 'eod') loadEod();
  });
});
document.getElementById('refreshEod').addEventListener('click', loadEod);

// ── SVG icons for analytics stat cards ───────────────────────
var RPT_ICONS = {
  pound:    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="14" y2="11"/><path d="M16 18H7M8 7a4 4 0 014 4v7"/></svg>',
  calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  tag:      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  moon:     '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
  clipboard:'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  trending: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  hotel:    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="7" x2="9.01" y2="7"/><line x1="15" y1="7" x2="15.01" y2="7"/><line x1="9" y1="12" x2="9.01" y2="12"/><line x1="15" y1="12" x2="15.01" y2="12"/><path d="M9 17h6v5H9z"/></svg>',
  xCircle:  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  checkOk:  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  alert:    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

// ── Overview Analytics ────────────────────────────────────────
async function loadReports() {
  ['reportsSummary','reportsSummary2','revChart','roomsChart','paymentsChart','nationsChart','statusChart']
    .forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="table-loading">Loading…</div>';
    });
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/analytics');
    if (!ok) return;
    renderReports(data.data);
  } catch {
    document.getElementById('reportsSummary').innerHTML = '<div class="table-error">Failed to load analytics.</div>';
  }
}

function renderReports(d) {
  const s  = d.summary;
  const sb = d.status_break || {};
  const totalActive = Number(s.total_bookings) || 1;
  const cancelRate  = totalActive ? ((Number(s.cancelled || 0) / totalActive) * 100).toFixed(1) : '0.0';
  const occupancy   = ((Number(s.in_house_now || 0) / 22) * 100).toFixed(0);

  // KPI strip 1
  document.getElementById('reportsSummary').innerHTML = [
    { label: 'Total Revenue',      val: '£' + Number(s.total_revenue).toLocaleString(),      cls: 'stat-gold',   icon: RPT_ICONS.pound    },
    { label: 'This Month Revenue', val: '£' + Number(s.this_month_revenue).toLocaleString(), cls: 'stat-green',  icon: RPT_ICONS.calendar },
    { label: 'Avg Booking Value',  val: '£' + Number(s.avg_booking_value).toFixed(0),        cls: 'stat-blue',   icon: RPT_ICONS.tag      },
    { label: 'Avg Stay (nights)',  val: Number(s.avg_nights).toFixed(1),                     cls: 'stat-purple', icon: RPT_ICONS.moon     },
    { label: 'Total Bookings',     val: s.total_bookings,                                    cls: 'stat-blue',   icon: RPT_ICONS.clipboard},
    { label: 'This Month',         val: s.this_month_bookings + ' bookings',                 cls: 'stat-green',  icon: RPT_ICONS.trending },
  ].map(function(x) {
    return '<div class="stat-card stat-card-hover">'
      + '<div class="stat-icon ' + x.cls + '">' + x.icon + '</div>'
      + '<div><p class="stat-label">' + x.label + '</p>'
      + '<p class="stat-value">' + x.val + '</p></div></div>';
  }).join('');

  // KPI strip 2 — operational metrics
  document.getElementById('reportsSummary2').innerHTML = [
    { label: 'Occupancy Now',     val: occupancy + '%',                                  cls: 'stat-teal',   icon: RPT_ICONS.hotel,   note: s.in_house_now + ' / 22 rooms' },
    { label: 'Cancellation Rate', val: cancelRate + '%',                                 cls: 'stat-orange', icon: RPT_ICONS.xCircle, note: s.cancelled + ' cancelled' },
    { label: 'Total Collected',   val: '£' + Number(s.total_collected).toLocaleString(), cls: 'stat-green',  icon: RPT_ICONS.checkOk, note: 'Payments received' },
    { label: 'Outstanding',       val: '£' + Number(s.outstanding).toLocaleString(),     cls: 'stat-indigo', icon: RPT_ICONS.alert,   note: 'Confirmed unpaid' },
  ].map(function(x) {
    return '<div class="stat-card stat-card-hover rpt-kpi2-card">'
      + '<div class="stat-icon ' + x.cls + '">' + x.icon + '</div>'
      + '<div><p class="stat-label">' + x.label + '</p>'
      + '<p class="stat-value">' + x.val + '</p>'
      + '<p class="stat-note">' + x.note + '</p></div></div>';
  }).join('');

  // Monthly revenue bar chart
  const monthly = d.monthly || [];
  if (!monthly.length) {
    document.getElementById('revChart').innerHTML = '<div class="fd-empty">No data yet.</div>';
  } else {
    const maxRev = Math.max.apply(null, monthly.map(function(m) { return Number(m.revenue); }).concat([1]));
    document.getElementById('revChart').innerHTML = '<div class="rev-chart">'
      + monthly.map(function(m) {
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
  document.getElementById('roomsChart').innerHTML = (d.rooms || []).map(function(r) {
    const maxBk = d.rooms[0].bookings || 1;
    const pct = Math.round((r.bookings / maxBk) * 100);
    return '<div class="horiz-bar-row">'
      + '<span class="horiz-bar-label"><span class="price-card-code" style="background:#0f172a;font-size:10px">'
      + r.room_code.toUpperCase() + '</span> ' + esc(r.room_name) + '</span>'
      + '<div class="horiz-bar-track"><div class="horiz-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<span class="horiz-bar-val">' + r.bookings + '</span>'
      + '</div>';
  }).join('') || '<div class="fd-empty">No data yet.</div>';

  // Payment methods
  const payLabels = { card: 'Card Payment', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  const payColors = { card: '#6366f1', bank: '#0891b2', payathotel: '#059669' };
  document.getElementById('paymentsChart').innerHTML = (d.payments || []).map(function(p) {
    return '<div class="pay-row">'
      + '<span class="pay-dot" style="background:' + (payColors[p.payment_method] || '#94a3b8') + '"></span>'
      + '<span class="pay-label">' + (payLabels[p.payment_method] || p.payment_method) + '</span>'
      + '<span class="pay-count">' + p.count + '</span>'
      + '</div>';
  }).join('') || '<div class="fd-empty">No data yet.</div>';

  // Guest nationalities
  const nations = d.nations || [];
  const maxNat  = nations.length ? nations[0].count : 1;
  document.getElementById('nationsChart').innerHTML = nations.map(function(n) {
    const pct = Math.round((n.count / maxNat) * 100);
    return '<div class="horiz-bar-row">'
      + '<span class="horiz-bar-label" style="min-width:130px">' + esc(n.country || 'Unknown') + '</span>'
      + '<div class="horiz-bar-track"><div class="horiz-bar-fill" style="width:' + pct + '%;background:#0891b2"></div></div>'
      + '<span class="horiz-bar-val">' + n.count + '</span>'
      + '</div>';
  }).join('') || '<div class="fd-empty">No nationality data yet.</div>';

  // Booking status breakdown
  const statusItems = [
    { label: 'Awaiting Confirmation', val: sb.awaiting_confirmation || 0, color: '#f59e0b' },
    { label: 'Confirmed (pre arrival)', val: sb.confirmed_pending_checkin || 0, color: '#0891b2' },
    { label: 'In House',              val: sb.in_house || 0,                  color: '#059669' },
    { label: 'Checked Out',           val: sb.checked_out || 0,               color: '#475569' },
    { label: 'Cancelled',             val: sb.cancelled || 0,                 color: '#ef4444' },
  ];
  const maxStatus = Math.max.apply(null, statusItems.map(function(x) { return x.val; }).concat([1]));
  document.getElementById('statusChart').innerHTML = statusItems.map(function(x) {
    const pct = Math.round((x.val / maxStatus) * 100);
    return '<div class="horiz-bar-row">'
      + '<span class="horiz-bar-label" style="min-width:160px">' + x.label + '</span>'
      + '<div class="horiz-bar-track"><div class="horiz-bar-fill" style="width:' + pct + '%;background:' + x.color + '"></div></div>'
      + '<span class="horiz-bar-val">' + x.val + '</span>'
      + '</div>';
  }).join('');
}

// ── End of Day ────────────────────────────────────────────────
var _eodData = null;

async function loadEod() {
  ['eodKpis','eodArrivals','eodInHouse','eodDepartures','eodNewBookings','eodCancellations']
    .forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="table-loading">Loading…</div>';
    });
  document.getElementById('eodDate').textContent    = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('eodGenAt').textContent   = '';
  try {
    const { ok, data } = await apiFetch('GET', '/api/admin/eod');
    if (!ok) { document.getElementById('eodKpis').innerHTML = '<div class="table-error">Failed to load EOD data.</div>'; return; }
    _eodData = data.data;
    renderEod(data.data);
  } catch {
    document.getElementById('eodKpis').innerHTML = '<div class="table-error">Failed to load EOD data.</div>';
  }
}

function renderEod(d) {
  const s = d.summary;
  document.getElementById('eodGenAt').textContent = 'Updated ' + new Date(d.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // KPI strip
  document.getElementById('eodKpis').innerHTML = [
    { label: 'Arrivals Today',     val: s.arrivals_today,     color: '#0891b2' },
    { label: 'Departures Today',   val: s.departures_today,   color: '#7c3aed' },
    { label: 'In House',           val: s.in_house_count,     color: '#059669' },
    { label: 'New Bookings',       val: s.new_bookings_today, color: '#0f172a' },
    { label: 'Revenue Today',      val: '£' + Number(s.new_revenue_today).toLocaleString(), color: '#c9a96e' },
    { label: 'Payments Received',  val: '£' + Number(s.payments_today).toLocaleString(),    color: '#16a34a' },
    { label: 'Outstanding',        val: '£' + Number(s.outstanding).toLocaleString(),       color: '#ef4444' },
  ].map(function(k) {
    return '<div class="eod-kpi-card">'
      + '<div class="eod-kpi-val" style="color:' + k.color + '">' + k.val + '</div>'
      + '<div class="eod-kpi-label">' + k.label + '</div>'
      + '</div>';
  }).join('');

  // Arrivals
  document.getElementById('eodArrivalsCount').textContent = (d.arrivals || []).length + ' guest' + (d.arrivals.length !== 1 ? 's' : '');
  document.getElementById('eodArrivals').innerHTML = (d.arrivals || []).length
    ? (d.arrivals || []).map(function(b) {
        const paid = b.payment_status === 'paid';
        const ci   = b.checked_in_at ? '&#x2714; Checked in' : 'Not yet checked in';
        return '<div class="eod-guest-row">'
          + '<div class="eod-guest-name">' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</div>'
          + '<div class="eod-guest-detail"><span class="price-card-code" style="background:#0f172a;font-size:10px">' + b.room_code.toUpperCase() + '</span> ' + esc(b.room_name) + ' &bull; ' + b.nights + ' nts</div>'
          + '<div class="eod-guest-meta">'
          + '<span class="eod-badge ' + (b.checked_in_at ? 'eod-badge-green' : 'eod-badge-amber') + '">' + ci + '</span>'
          + '<span class="eod-badge ' + (paid ? 'eod-badge-green' : 'eod-badge-red') + '">' + (paid ? 'Paid' : '£' + (Number(b.total_amount) - Number(b.amount_paid)).toLocaleString() + ' due') + '</span>'
          + '</div>'
          + (b.special_requests ? '<div class="eod-guest-note">&#x1F4AC; ' + esc(b.special_requests) + '</div>' : '')
          + '</div>';
      }).join('')
    : '<div class="fd-empty">No arrivals today.</div>';

  // In House
  document.getElementById('eodInHouseCount').textContent = (d.in_house || []).length + ' guest' + (d.in_house.length !== 1 ? 's' : '');
  document.getElementById('eodInHouse').innerHTML = (d.in_house || []).length
    ? (d.in_house || []).map(function(b) {
        return '<div class="eod-guest-row">'
          + '<div class="eod-guest-name">' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</div>'
          + '<div class="eod-guest-detail"><span class="price-card-code" style="background:#0f172a;font-size:10px">' + b.room_code.toUpperCase() + '</span> ' + esc(b.room_name) + ' &bull; ' + b.nights + ' nts</div>'
          + '<div class="eod-guest-meta"><span class="eod-badge eod-badge-blue">Out: ' + fmtDate(b.checkout_date) + '</span>'
          + '<span class="eod-badge ' + (b.payment_status === 'paid' ? 'eod-badge-green' : 'eod-badge-red') + '">' + (b.payment_status === 'paid' ? 'Paid' : 'Balance due') + '</span></div>'
          + '</div>';
      }).join('')
    : '<div class="fd-empty">No guests currently in house.</div>';

  // Departures
  document.getElementById('eodDepsCount').textContent = (d.departures || []).length + ' guest' + (d.departures.length !== 1 ? 's' : '');
  document.getElementById('eodDepartures').innerHTML = (d.departures || []).length
    ? (d.departures || []).map(function(b) {
        const co = b.checked_out_at ? '&#x2714; Checked out' : 'Not yet checked out';
        return '<div class="eod-guest-row">'
          + '<div class="eod-guest-name">' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</div>'
          + '<div class="eod-guest-detail"><span class="price-card-code" style="background:#0f172a;font-size:10px">' + b.room_code.toUpperCase() + '</span> ' + esc(b.room_name) + ' &bull; ' + b.nights + ' nts</div>'
          + '<div class="eod-guest-meta">'
          + '<span class="eod-badge ' + (b.checked_out_at ? 'eod-badge-green' : 'eod-badge-amber') + '">' + co + '</span>'
          + '<span class="eod-badge ' + (b.payment_status === 'paid' ? 'eod-badge-green' : 'eod-badge-red') + '">' + (b.payment_status === 'paid' ? 'Fully Paid' : '£' + (Number(b.total_amount) - Number(b.amount_paid)).toLocaleString() + ' outstanding') + '</span>'
          + '</div>'
          + '</div>';
      }).join('')
    : '<div class="fd-empty">No departures today.</div>';

  // New bookings today
  document.getElementById('eodNewBkCount').textContent = (d.new_bookings || []).length + ' booking' + (d.new_bookings.length !== 1 ? 's' : '');
  document.getElementById('eodNewBookings').innerHTML = (d.new_bookings || []).length
    ? '<table class="eod-mini-table"><thead><tr><th>Ref</th><th>Guest</th><th>Room</th><th>Check-in</th><th>Check-out</th><th>Total</th><th>Status</th></tr></thead><tbody>'
      + (d.new_bookings || []).map(function(b) {
          return '<tr><td><span class="ref-badge">' + b.ref + '</span></td>'
            + '<td>' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</td>'
            + '<td>' + b.room_code.toUpperCase() + '</td>'
            + '<td>' + fmtDate(b.checkin_date) + '</td>'
            + '<td>' + fmtDate(b.checkout_date) + '</td>'
            + '<td>£' + Number(b.total_amount).toLocaleString() + '</td>'
            + '<td><span class="status-badge status-' + b.status + '">' + b.status + '</span></td></tr>';
        }).join('')
      + '</tbody></table>'
    : '<div class="fd-empty">No new bookings made today.</div>';

  // Cancellations today
  document.getElementById('eodCancelCount').textContent = (d.cancellations || []).length + ' cancellation' + (d.cancellations.length !== 1 ? 's' : '');
  document.getElementById('eodCancellations').innerHTML = (d.cancellations || []).length
    ? '<table class="eod-mini-table"><thead><tr><th>Ref</th><th>Guest</th><th>Room</th><th>Total</th></tr></thead><tbody>'
      + (d.cancellations || []).map(function(b) {
          return '<tr><td><span class="ref-badge">' + b.ref + '</span></td>'
            + '<td>' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</td>'
            + '<td>' + b.room_code.toUpperCase() + '</td>'
            + '<td>£' + Number(b.total_amount).toLocaleString() + '</td></tr>';
        }).join('')
      + '</tbody></table>'
    : '<div class="fd-empty" style="color:#64748b">No cancellations today.</div>';
}

// ── EOD PDF download ──────────────────────────────────────────
function downloadEodPDF() {
  var d = _eodData;
  if (!d) { alert('EOD data not yet loaded. Please wait for the report to load.'); return; }

  var s       = d.summary;
  var today   = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var genTime = new Date(d.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // ── helpers ──────────────────────────────────────────────────
  // table-layout:fixed + explicit colgroup = consistent widths in html2canvas
  var COLS = '<colgroup><col style="width:17%"><col style="width:26%"><col style="width:23%"><col style="width:16%"><col style="width:18%"></colgroup>';
  var TH   = function(t, align) {
    return '<th style="padding:6px 8px;font-size:9px;font-weight:700;text-align:' + (align||'left') + ';color:#475569;border-bottom:1.5px solid #e2e8f0">' + t + '</th>';
  };
  var THEAD = '<thead><tr style="background:#f8fafc">' + TH('REF') + TH('GUEST') + TH('ROOM') + TH('TOTAL','right') + TH('PAYMENT') + '</tr></thead>';

  function guestRows(arr) {
    if (!arr || !arr.length) {
      return '<tr><td colspan="5" style="padding:12px;color:#94a3b8;text-align:center;font-size:10.5px;font-style:italic">None</td></tr>';
    }
    return arr.map(function(b) {
      var paid   = b.payment_status === 'paid';
      var bal    = Number(b.total_amount || 0) - Number(b.amount_paid || 0);
      var pColor = paid ? '#16a34a' : '#ef4444';
      var pLabel = paid ? '&#10003; Paid' : '£' + bal.toLocaleString() + ' due';
      return '<tr style="border-bottom:1px solid #f4f6f8">'
        + '<td style="padding:7px 8px;font-size:9.5px;font-family:monospace;font-weight:700;overflow:hidden">' + esc(b.ref) + '</td>'
        + '<td style="padding:7px 8px;font-size:10.5px;font-weight:600;overflow:hidden">' + esc(b.guest_first_name) + ' ' + esc(b.guest_last_name) + '</td>'
        + '<td style="padding:7px 8px;font-size:10px;overflow:hidden">' + b.room_code.toUpperCase() + ' ' + esc(b.room_name) + '</td>'
        + '<td style="padding:7px 8px;font-size:10.5px;font-weight:700;text-align:right">£' + Number(b.total_amount).toLocaleString() + '</td>'
        + '<td style="padding:7px 8px;font-size:10px;font-weight:700;color:' + pColor + '">' + pLabel + '</td>'
        + '</tr>';
    }).join('');
  }

  function section(title, arr) {
    return '<div style="margin-bottom:20px">'
      + '<div style="background:#0f172a;padding:8px 14px;border-radius:5px 5px 0 0;display:flex;align-items:center;gap:10px">'
      + '<span style="font-size:10.5px;font-weight:800;color:#c9a96e;letter-spacing:0.5px;text-transform:uppercase">' + title + '</span>'
      + '<span style="font-size:10px;color:#94a3b8;background:rgba(255,255,255,0.1);padding:1px 7px;border-radius:10px">' + (arr ? arr.length : 0) + '</span>'
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #e2e8f0;border-top:none">'
      + COLS + THEAD
      + '<tbody>' + guestRows(arr) + '</tbody>'
      + '</table></div>';
  }

  // ── KPI row cells ─────────────────────────────────────────────
  var kpiItems = [
    { l: 'Arrivals',          v: s.arrivals_today,                                       c: '#0891b2' },
    { l: 'Departures',        v: s.departures_today,                                     c: '#7c3aed' },
    { l: 'In House',          v: s.in_house_count,                                       c: '#059669' },
    { l: 'New Bookings',      v: s.new_bookings_today,                                   c: '#0f172a' },
    { l: 'Revenue Today',     v: '£' + Number(s.new_revenue_today).toLocaleString(),     c: '#c9a96e' },
    { l: 'Payments Received', v: '£' + Number(s.payments_today).toLocaleString(),        c: '#16a34a' },
    { l: 'Outstanding',       v: '£' + Number(s.outstanding).toLocaleString(),           c: '#ef4444' },
  ];

  var html =
    // ── outer wrapper — width matches _runPDF default (730px) ───
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#fff;padding:0">'

    // hotel header
    + '<div style="background:#0f172a;padding:20px 28px">'
    + '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>'
    + '<td style="width:55%;vertical-align:top">'
    + '<div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a96e;margin-bottom:3px">PRIVATE HOTEL &middot; LONDON</div>'
    + '<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:1px">BLUEDAWS</div>'
    + '<div style="font-size:10px;color:#64748b;margin-top:3px">133-135 Sussex Gardens, Hyde Park, London W2 2RX</div>'
    + '</td>'
    + '<td style="width:45%;text-align:right;vertical-align:top">'
    + '<div style="font-size:16px;font-weight:900;color:#fff;letter-spacing:0.5px">END OF DAY REPORT</div>'
    + '<div style="font-size:11.5px;color:#c9a96e;margin-top:5px;font-weight:700">' + today + '</div>'
    + '<div style="font-size:10px;color:#64748b;margin-top:3px">Generated at ' + genTime + '</div>'
    + '</td></tr></table>'
    + '</div>'
    + '<div style="height:3px;background:linear-gradient(90deg,#c9a96e,#e8c98a,#c9a96e)"></div>'

    // KPI strip — table-layout:fixed prevents overflow
    + '<div style="padding:16px 28px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0">'
    + '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
    + '<tr>'
    + kpiItems.map(function(k) {
        return '<td style="padding:10px 4px;text-align:center">'
          + '<div style="font-size:18px;font-weight:900;color:' + k.c + ';line-height:1">' + k.v + '</div>'
          + '<div style="font-size:8.5px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">' + k.l + '</div>'
          + '</td>';
      }).join('')
    + '</tr></table>'
    + '</div>'

    // sections
    + '<div style="padding:16px 28px 24px">'
    + section('Arrivals Today',       d.arrivals)
    + section('Departures Today',     d.departures)
    + section('Currently In House',   d.in_house)
    + section('New Bookings Today',   d.new_bookings)
    + (d.cancellations && d.cancellations.length ? section('Cancellations Today', d.cancellations) : '')

    // footer
    + '<div style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">'
    + '<div style="font-size:9px;color:#94a3b8;font-weight:500">Bluedaws Private Hotel &mdash; Confidential</div>'
    + '<div style="font-size:9px;color:#94a3b8;font-weight:500">End of Day Report &mdash; ' + today + '</div>'
    + '</div>'
    + '</div></div>';

  var filename = 'EOD-Report-' + new Date().toISOString().slice(0, 10) + '.pdf';
  _runPDF(html, filename, 'eodPdfBtn', '&#x2B07; Download EOD PDF', { width: 730 });
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
