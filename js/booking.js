// ======================================================================
// BLUEDAWS HOTEL — Booking Engine
// ======================================================================

const API_BASE = 'https://api.bluedawshotel.com';

// ---------- Room type data (guests book a type; admin allocates a specific room) ----------
const ROOM_TYPES = {
  single:        { name: 'Single Room',             bed: '1 Single Bed',                   max: 1, price: 85,  priceKey: 'price_d6',  img: 'double-room',       tags: ['Single Bed'],           popular: false },
  twin:          { name: 'Twin Room',               bed: '2 Single Beds',                  max: 2, price: 110, priceKey: 'price_c3',  img: 'twin-room',         tags: ['Twin Beds'],            popular: false },
  triple:        { name: 'Triple Room',             bed: '1 Bunk + 1 Single',              max: 3, price: 135, priceKey: 'price_b6',  img: 'triple-quad-bunk',  tags: ['Bunk + Single'],        popular: false },
  double_single: { name: 'Double + Single Room',    bed: '1 Double + 1 Single',            max: 3, price: 145, priceKey: 'price_b8',  img: 'double-room',       tags: ['Double + Single'],      popular: false },
  family:        { name: 'Family Room',             bed: '1 Double + 2 Single Beds',       max: 4, price: 160, priceKey: 'price_b7',  img: 'quad-room',         tags: ['Double + 2 Singles'],   popular: true  },
  large_family:  { name: 'Large Family Room',       bed: '1 Double + 1 Single + 1 Bunk',  max: 5, price: 195, priceKey: 'price_b2',  img: 'triple-room-2',     tags: ['Bunk + Double'],        popular: false },
  group_6:       { name: 'Group Room',              bed: '3 Bunk Beds (6 Beds)',           max: 6, price: 225, priceKey: 'price_b5',  img: 'group-room',        tags: ['3 Bunk Beds'],          popular: false },
  group_mixed:   { name: 'Group Room (Mixed Beds)', bed: '1 Double + 2 Single + 1 Bunk',  max: 6, price: 235, priceKey: 'price_b3',  img: 'twin-room-b',       tags: ['Mixed Beds'],           popular: false },
  large_group:   { name: 'Large Group Room',        bed: '3 Bunk + 1 Single (7 Beds)',     max: 7, price: 275, priceKey: 'price_z6',  img: 'triple-room',       tags: ['Largest Room'],         popular: false },
};

// ---------- Load live prices from admin settings ----------
function applyBDWPrices(d) {
  Object.keys(ROOM_TYPES).forEach(function(key) {
    var priceKey = ROOM_TYPES[key].priceKey;
    var val = d[priceKey];
    if (val !== undefined) {
      var p = parseInt(val, 10);
      if (!isNaN(p) && p > 0) ROOM_TYPES[key].price = p;
    }
  });
}
window.applyBDWPrices = applyBDWPrices;

// Layer 1: localStorage — instant, set by admin portal on same browser
try {
  var _lp = JSON.parse(localStorage.getItem('bdw_prices') || 'null');
  if (_lp && typeof _lp === 'object') applyBDWPrices(_lp);
} catch(_) {}

// Layer 2: prices.js <script async> tag already ran
if (window.__BDW_PRICES__) applyBDWPrices(window.__BDW_PRICES__);

// Layer 3: main.js fetch result
window._onBdwSettingsLoaded = applyBDWPrices;
if (window._bdwSettings) applyBDWPrices(window._bdwSettings);

// Layer 4: own fetch with retries
(function() {
  function attempt(n) {
    fetch(API_BASE + '/api/settings', { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(res) { if (res && res.data) applyBDWPrices(res.data); })
      .catch(function() { if (n > 0) setTimeout(function() { attempt(n - 1); }, 8000); });
  }
  attempt(3);
}());

// ---------- State ----------
const state = {
  checkin: '', checkout: '', nights: 0,
  adults: 2, children: 0,
  roomKey: null, payment: 'card',
  guest: { firstName: '', lastName: '', email: '', phone: '', country: '', requests: '' },
  bookingRef: '',
  emailSent: false,
};

// ---------- Helpers ----------
function fmtDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateShort(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Step management ----------
function showStep(n) {
  document.querySelectorAll('.booking-step').forEach((el, i) => {
    el.classList.toggle('hidden', i + 1 !== n);
  });
  const successEl = document.getElementById('stepSuccess');
  if (successEl) successEl.classList.add('hidden');

  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i + 1 < n) el.classList.add('completed');
    if (i + 1 === n) el.classList.add('active');
  });
  document.querySelectorAll('.step-line').forEach((el, i) => {
    el.classList.toggle('completed', i + 1 < n);
  });

  if (n === 5 && successEl) {
    document.querySelectorAll('.booking-step').forEach(el => el.classList.add('hidden'));
    successEl.classList.remove('hidden');
    document.querySelectorAll('.step, .step-line').forEach(el => el.classList.add('completed'));
  }

  window.scrollTo({ top: 300, behavior: 'smooth' });
}

// ---------- Date inputs ----------
const checkinEl  = document.getElementById('checkin');
const checkoutEl = document.getElementById('checkout');
const durationDisplay = document.getElementById('durationDisplay');

const todayStr = new Date().toISOString().split('T')[0];
if (checkinEl)  checkinEl.min  = todayStr;
if (checkoutEl) checkoutEl.min = todayStr;

// Pre-fill from URL params
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('checkin')  && checkinEl)  checkinEl.value  = urlParams.get('checkin');
if (urlParams.get('checkout') && checkoutEl) checkoutEl.value = urlParams.get('checkout');
if (urlParams.get('adults')) {
  const aEl = document.getElementById('adults');
  if (aEl) aEl.value = urlParams.get('adults');
}

function calcNights() {
  if (!checkinEl.value || !checkoutEl.value) {
    if (durationDisplay) durationDisplay.classList.remove('visible');
    return 0;
  }
  const diff = (new Date(checkoutEl.value) - new Date(checkinEl.value)) / 86400000;
  if (diff <= 0) {
    if (durationDisplay) durationDisplay.classList.remove('visible');
    return 0;
  }
  if (durationDisplay) {
    durationDisplay.innerHTML = `<strong>${diff} night${diff !== 1 ? 's' : ''}</strong> &nbsp;·&nbsp; ${fmtDateShort(checkinEl.value)} &rarr; ${fmtDateShort(checkoutEl.value)}`;
    durationDisplay.classList.add('visible');
  }
  return diff;
}

checkinEl.addEventListener('change', () => {
  checkoutEl.min = checkinEl.value;
  if (checkoutEl.value && checkoutEl.value <= checkinEl.value) {
    const d = new Date(checkinEl.value + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    checkoutEl.value = d.toISOString().split('T')[0];
  }
  state.nights = calcNights();
  updateSummary();
});
checkoutEl.addEventListener('change', () => {
  state.nights = calcNights();
  updateSummary();
});

// ---------- Room types fully booked for the current date range ----------
let bookedTypes = [];

// ---------- Render room type cards dynamically ----------
function renderRooms(totalGuests) {
  const container = document.getElementById('bookingRooms');
  if (!container) return;

  const badge = document.getElementById('guestFilterBadge');
  if (badge) {
    badge.textContent = `Showing rooms for ${totalGuests} guest${totalGuests !== 1 ? 's' : ''}`;
  }

  // Filter by guest capacity AND hide fully booked types
  const eligible = Object.entries(ROOM_TYPES).filter(([key, r]) =>
    r.max >= totalGuests && !bookedTypes.includes(key)
  );

  if (eligible.length === 0) {
    container.innerHTML = `<p class="summary-empty" style="padding:24px 0">No rooms available for ${totalGuests} guests on those dates. Please call us or try different dates.</p>`;
    return;
  }

  // Group by max-guest tier
  const groups = {};
  eligible.forEach(([key, r]) => {
    const tier = r.max;
    if (!groups[tier]) groups[tier] = [];
    groups[tier].push([key, r]);
  });

  const tierLabels = { 1: '1 Guest', 2: '2 Guests', 3: '3 Guests', 4: '4 Guests', 5: '5 Guests', 6: '6 Guests', 7: '7 Guests' };

  let html = '';
  Object.keys(groups).sort((a, b) => a - b).forEach(tier => {
    html += `<div class="brc-group-label">${tierLabels[tier] || tier + ' Guests'}</div>`;
    groups[tier].forEach(([key, r]) => {
      const imgSrc = `assets/images/${r.img}.jpg`;
      const popularBadge = r.popular ? `<span class="popular-tag">Popular</span>` : '';
      const tagHtml = r.tags.map(t => `<span>${t}</span>`).join('');
      html += `
        <label class="booking-room-option">
          <input type="radio" name="roomChoice" value="${key}" data-price="${r.price}" data-name="${r.name}">
          <div class="booking-room-card">
            <div class="brc-img" style="background-image:url('${imgSrc}')"></div>
            <div class="brc-info">
              <div class="brc-top">
                <div>
                  <h3>${r.name} ${popularBadge}</h3>
                  <p>${r.bed} &middot; up to ${r.max} Guest${r.max !== 1 ? 's' : ''}</p>
                </div>
                <div class="brc-price">&pound;${r.price}<span>/night</span></div>
              </div>
              <div class="brc-tags"><span>Wi-Fi</span><span>Breakfast</span>${tagHtml}</div>
            </div>
            <div class="brc-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg></div>
          </div>
        </label>`;
    });
  });

  container.innerHTML = html;

  // Re-select room if already chosen
  if (state.roomKey) {
    const radio = container.querySelector(`input[value="${state.roomKey}"]`);
    if (radio) radio.checked = true;
  }
}

// ---------- Step 1 → Step 2 ----------
document.getElementById('toStep2').addEventListener('click', async () => {
  let ok = true;
  const ciErr = document.getElementById('checkinErr');
  const coErr = document.getElementById('checkoutErr');

  if (!checkinEl.value) {
    ciErr.textContent = 'Please select a check-in date.'; ok = false;
  } else {
    ciErr.textContent = '';
  }
  if (!checkoutEl.value) {
    coErr.textContent = 'Please select a check-out date.'; ok = false;
  } else if (checkoutEl.value <= checkinEl.value) {
    coErr.textContent = 'Check-out must be after check-in.'; ok = false;
  } else {
    coErr.textContent = '';
  }
  if (!ok) return;

  state.checkin  = checkinEl.value;
  state.checkout = checkoutEl.value;
  state.nights   = calcNights();
  state.adults   = +document.getElementById('adults').value;
  state.children = +document.getElementById('children').value;

  // Fetch which room types are fully booked for these dates (single DB query)
  const btn = document.getElementById('toStep2');
  const origText = btn.textContent;
  btn.textContent = 'Checking availability…';
  btn.disabled = true;
  try {
    const params = new URLSearchParams({ checkin_date: state.checkin, checkout_date: state.checkout });
    const res  = await fetch(API_BASE + '/api/bookings/availability/batch?' + params);
    const data = await res.json();
    bookedTypes = (data.success && Array.isArray(data.booked_types)) ? data.booked_types : [];
  } catch (_) {
    bookedTypes = []; // network error — show all types, backend will guard on confirm
  }
  btn.textContent = origText;
  btn.disabled = false;

  renderRooms(state.adults + state.children);
  updateSummary();
  showStep(2);
});

// ---------- Step 2 → Step 3 ----------
document.getElementById('toStep3').addEventListener('click', async () => {
  const sel   = document.querySelector('input[name="roomChoice"]:checked');
  const errEl = document.getElementById('roomErr');
  if (!sel) {
    if (errEl) errEl.textContent = 'Please select a room type to continue.';
    return;
  }
  if (errEl) errEl.textContent = '';

  const btn      = document.getElementById('toStep3');
  const origText = btn.textContent;
  btn.textContent = 'Checking availability…';
  btn.disabled    = true;

  try {
    const params = new URLSearchParams({
      room_type:     sel.value,
      checkin_date:  state.checkin,
      checkout_date: state.checkout,
    });
    const res  = await fetch(API_BASE + '/api/bookings/availability?' + params);
    const data = await res.json();

    if (data.success && !data.available) {
      if (errEl) errEl.textContent = 'This room type is fully booked for your selected dates. Please choose a different room type or dates.';
      btn.textContent = origText;
      btn.disabled    = false;
      return;
    }
  } catch (_) {
    // Network error — let backend reject it on confirm if needed
  }

  btn.textContent = origText;
  btn.disabled    = false;
  state.roomKey   = sel.value;
  updateSummary();
  showStep(3);
});
document.getElementById('backToStep1').addEventListener('click', () => showStep(1));

// ---------- Step 3 → Step 4 ----------
document.getElementById('toStep4').addEventListener('click', () => {
  const fields = [
    { id: 'gFirstName', errId: 'gFirstNameErr', msg: 'First name is required.' },
    { id: 'gLastName',  errId: 'gLastNameErr',  msg: 'Last name is required.' },
    { id: 'gEmail',     errId: 'gEmailErr',     msg: 'A valid email address is required.' },
    { id: 'gPhone',     errId: 'gPhoneErr',     msg: 'Phone number is required.' },
    { id: 'gCountry',   errId: 'gCountryErr',   msg: 'Please select your country.' },
  ];
  let ok = true;
  fields.forEach(({ id, errId, msg }) => {
    const el = document.getElementById(id);
    let valid = el.value.trim() !== '';
    if (id === 'gEmail') valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
    document.getElementById(errId).textContent = valid ? '' : msg;
    el.classList.toggle('error', !valid);
    if (!valid) ok = false;
  });
  if (!ok) return;

  state.guest.firstName = document.getElementById('gFirstName').value.trim();
  state.guest.lastName  = document.getElementById('gLastName').value.trim();
  state.guest.email     = document.getElementById('gEmail').value.trim();
  state.guest.phone     = document.getElementById('gPhone').value.trim();
  state.guest.country   = document.getElementById('gCountry').value;
  state.guest.requests  = (document.getElementById('gRequests') || {}).value || '';
  const payEl = document.querySelector('input[name="payment"]:checked');
  state.payment = payEl ? payEl.value : 'card';

  buildConfirmSummary();
  showStep(4);
});
document.getElementById('backToStep2').addEventListener('click', () => showStep(2));

// ---------- Confirm summary ----------
function buildConfirmSummary() {
  const room  = ROOM_TYPES[state.roomKey];
  const total = room ? state.nights * room.price : 0;
  const payLabel = { card: 'Credit / Debit Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  const guestStr = `${state.adults} Adult${state.adults !== 1 ? 's' : ''}${state.children > 0 ? `, ${state.children} Child${state.children !== 1 ? 'ren' : ''}` : ''}`;

  const el = document.getElementById('confirmSummary');
  if (!el) return;
  el.innerHTML = `
    <div class="confirm-row"><label>Guest</label><span>${state.guest.firstName} ${state.guest.lastName}</span></div>
    <div class="confirm-row"><label>Email</label><span>${state.guest.email}</span></div>
    <div class="confirm-row"><label>Phone</label><span>${state.guest.phone}</span></div>
    <div class="confirm-row"><label>Country</label><span>${state.guest.country}</span></div>
    <div class="confirm-row"><label>Room Type</label><span>${room ? room.name : '—'}</span></div>
    <div class="confirm-row"><label>Beds</label><span>${room ? room.bed : '—'}</span></div>
    <div class="confirm-row"><label>Check-in</label><span>${fmtDate(state.checkin)}</span></div>
    <div class="confirm-row"><label>Check-out</label><span>${fmtDate(state.checkout)}</span></div>
    <div class="confirm-row"><label>Duration</label><span>${state.nights} night${state.nights !== 1 ? 's' : ''}</span></div>
    <div class="confirm-row"><label>Guests</label><span>${guestStr}</span></div>
    <div class="confirm-row"><label>Rate</label><span>&pound;${room ? room.price : 0}/night</span></div>
    <div class="confirm-row"><label>Payment</label><span>${payLabel[state.payment] || state.payment}</span></div>
    ${state.guest.requests ? `<div class="confirm-row"><label>Requests</label><span>${state.guest.requests}</span></div>` : ''}
    <div class="confirm-row confirm-total"><label>Total</label><span>&pound;${total.toLocaleString()}</span></div>
  `;
}

// ---------- Final Confirm button ----------
document.getElementById('confirmBooking').addEventListener('click', async () => {
  const terms = document.getElementById('termsCheck');
  const termsErr = document.getElementById('termsErr');
  if (!terms.checked) {
    termsErr.textContent = 'Please agree to the terms and conditions.';
    return;
  }
  termsErr.textContent = '';

  const btn = document.getElementById('confirmBooking');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkin_date:      state.checkin,
        checkout_date:     state.checkout,
        adults:            state.adults,
        children:          state.children,
        room_type:         state.roomKey,
        payment_method:    state.payment,
        guest_first_name:  state.guest.firstName,
        guest_last_name:   state.guest.lastName,
        guest_email:       state.guest.email,
        guest_phone:       state.guest.phone,
        guest_country:     state.guest.country,
        special_requests:  state.guest.requests || null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      let msg = data.message || 'Booking failed. Please try again.';
      // Show individual field errors if available (helps debug validation failures)
      if (Array.isArray(data.errors) && data.errors.length) {
        msg = data.errors.map(e => e.message || e.msg).join(' · ');
      }
      if (response.status === 409) {
        // Room type taken between check and confirm — go back to room selection
        const roomErr = document.getElementById('roomErr');
        if (roomErr) roomErr.textContent = msg;
        btn.textContent = 'Confirm Booking';
        btn.disabled = false;
        showStep(2);
      } else {
        termsErr.textContent = msg;
        btn.textContent = 'Confirm Booking';
        btn.disabled = false;
      }
      return;
    }

    const ref = data.data.ref;
    state.bookingRef = ref;

    const refEl   = document.getElementById('successRef');
    const emailEl = document.getElementById('successEmail');
    if (refEl)   refEl.textContent   = `Booking Reference: ${ref}`;
    if (emailEl) emailEl.textContent = state.guest.email;

    showStep(5);
  } catch (err) {
    termsErr.textContent = 'Network error. Please check your connection and try again.';
    btn.textContent = 'Confirm Booking';
    btn.disabled = false;
  }
});
document.getElementById('backToStep3').addEventListener('click', () => showStep(3));

// ---------- Summary panel ----------
function updateSummary() {
  const datesEl  = document.getElementById('summaryDates');
  const roomEl   = document.getElementById('summaryRoom');
  const totalEl  = document.getElementById('summaryTotal');
  const totalAmt = document.getElementById('totalAmount');
  const totalDiv = document.getElementById('summaryTotalDivider');

  if (state.checkin && state.checkout && state.nights > 0) {
    const g = `${state.adults} adult${state.adults !== 1 ? 's' : ''}${state.children > 0 ? `, ${state.children} child${state.children !== 1 ? 'ren' : ''}` : ''}`;
    datesEl.innerHTML = `
      <div class="summary-item"><label>Check-in</label><span>${fmtDateShort(state.checkin)}</span></div>
      <div class="summary-item"><label>Check-out</label><span>${fmtDateShort(state.checkout)}</span></div>
      <div class="summary-item"><label>Nights</label><span>${state.nights}</span></div>
      <div class="summary-item"><label>Guests</label><span>${g}</span></div>
    `;
  } else {
    datesEl.innerHTML = '<p class="summary-empty">Select your dates above.</p>';
  }

  const room = state.roomKey ? ROOM_TYPES[state.roomKey] : null;
  if (room) {
    roomEl.innerHTML = `
      <div class="summary-item"><label>Room</label><span>${room.name}</span></div>
      <div class="summary-item"><label>Beds</label><span>${room.bed}</span></div>
      <div class="summary-item"><label>Rate</label><span>&pound;${room.price}/night</span></div>
    `;
    if (state.nights > 0 && totalEl && totalAmt) {
      totalEl.style.display  = 'flex';
      if (totalDiv) totalDiv.style.display = 'block';
      totalAmt.textContent   = `£${(state.nights * room.price).toLocaleString()}`;
    }
  } else {
    roomEl.innerHTML = '<p class="summary-empty">No room selected yet.</p>';
    if (totalEl) totalEl.style.display  = 'none';
    if (totalDiv) totalDiv.style.display = 'none';
  }
}

// ---------- Field validation helpers for step 3 ----------
['gFirstName','gLastName','gEmail','gPhone'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    if (el.classList.contains('error')) {
      let valid = el.value.trim() !== '';
      if (id === 'gEmail') valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      if (valid) { el.classList.remove('error'); document.getElementById(id + 'Err').textContent = ''; }
    }
  });
});

// ---------- Init ----------
if (checkinEl.value && checkoutEl.value) state.nights = calcNights();
const totalGuests = (+document.getElementById('adults').value || 2) + (+document.getElementById('children').value || 0);
renderRooms(totalGuests);
updateSummary();

// Fetch dynamic room prices from backend (non-blocking)
fetch(`${API_BASE}/api/settings`)
  .then(r => r.json())
  .then(({ data }) => {
    if (!data) return;
    let changed = false;
    Object.keys(ROOM_TYPES).forEach(key => {
      const val = data[ROOM_TYPES[key].priceKey];
      if (val && Number(val) !== ROOM_TYPES[key].price) {
        ROOM_TYPES[key].price = Number(val);
        changed = true;
      }
    });
    if (changed) { renderRooms(totalGuests); updateSummary(); }
  })
  .catch(() => {});
