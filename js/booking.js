// ---------- Real room data ----------
const ROOMS = {
  d6:  { name: 'Single Room (D6)',             bed: 'Third Floor · 1 Single Bed',             max: 1, price: 85  },
  c3:  { name: 'Twin Room (C3)',               bed: 'Second Floor · 2 Single Beds',            max: 2, price: 110 },
  d3:  { name: 'Twin Room (D3)',               bed: 'Third Floor · 2 Single Beds',             max: 2, price: 110 },
  b6:  { name: 'Triple Room (B6)',             bed: 'First Floor · 1 Bunk + 1 Single',         max: 3, price: 135 },
  c6:  { name: 'Triple Room (C6)',             bed: 'Second Floor · 1 Bunk + 1 Single',        max: 3, price: 135 },
  b8:  { name: 'Double + Single (B8)',         bed: 'First Floor · 1 Double + 1 Single',       max: 3, price: 145 },
  b7:  { name: 'Family Room (B7)',             bed: 'First Floor · 1 Double + 2 Single',       max: 4, price: 160 },
  e2:  { name: 'Family Room (E2)',             bed: 'Fourth Floor · 1 Double + 2 Single',      max: 4, price: 160 },
  e3:  { name: 'Family Room (E3)',             bed: 'Fourth Floor · 1 Double + 2 Single',      max: 4, price: 160 },
  b2:  { name: 'Large Family Room (B2)',       bed: 'First Floor · 1 Double + 1 Single + 1 Bunk', max: 5, price: 195 },
  b4:  { name: 'Large Family Room (B4)',       bed: 'First Floor · 1 Double + 1 Single + 1 Bunk', max: 5, price: 195 },
  b5:  { name: 'Group Room (B5)',              bed: 'First Floor · 3 Bunk Beds',               max: 6, price: 225 },
  c1:  { name: 'Group Room (C1)',              bed: 'Second Floor · 3 Bunk Beds',              max: 6, price: 225 },
  c4:  { name: 'Group Room (C4)',              bed: 'Second Floor · 3 Bunk Beds',              max: 6, price: 225 },
  d1:  { name: 'Group Room (D1)',              bed: 'Third Floor · 3 Bunk Beds',               max: 6, price: 225 },
  d2:  { name: 'Group Room (D2)',              bed: 'Third Floor · 3 Bunk Beds',               max: 6, price: 225 },
  d5:  { name: 'Group Room (D5)',              bed: 'Third Floor · 3 Bunk Beds',               max: 6, price: 225 },
  b3:  { name: 'Group Room (B3)',              bed: 'First Floor · 1 Double + 2 Single + 1 Bunk', max: 6, price: 235 },
  c5:  { name: 'Group Room (C5)',              bed: 'Second Floor · 2 Bunk + 2 Single',        max: 6, price: 235 },
  d4:  { name: 'Group Room (D4)',              bed: 'Third Floor · 2 Bunk + 2 Single',         max: 6, price: 235 },
  z6:  { name: 'Large Group Room (Z6)',        bed: 'Basement · 3 Bunk + 1 Single',            max: 7, price: 275 },
  c2:  { name: 'Large Group Room (C2)',        bed: 'Second Floor · 3 Bunk + 1 Single',        max: 7, price: 275 },
};

// ---------- State ----------
const state = {
  checkin: '', checkout: '', nights: 0,
  adults: 2, children: 0,
  roomKey: null, payment: 'card',
  guest: { firstName: '', lastName: '', email: '', phone: '', country: '' },
};

// ---------- Step management ----------
function showStep(n) {
  document.querySelectorAll('.booking-step').forEach((el, i) => {
    el.classList.toggle('hidden', i + 1 !== n);
  });
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i + 1 < n) el.classList.add('completed');
    if (i + 1 === n) el.classList.add('active');
  });
  document.querySelectorAll('.step-line').forEach((el, i) => {
    el.classList.toggle('completed', i + 1 < n);
  });
  if (n === 5) {
    document.querySelectorAll('.booking-step').forEach(el => el.classList.add('hidden'));
    document.getElementById('stepSuccess').classList.remove('hidden');
    document.querySelectorAll('.step, .step-line').forEach(el => el.classList.add('completed'));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Step 1: Dates ----------
const checkin  = document.getElementById('checkin');
const checkout = document.getElementById('checkout');
const durationDisplay = document.getElementById('durationDisplay');

const today = new Date().toISOString().split('T')[0];
if (checkin)  checkin.min  = today;
if (checkout) checkout.min = today;

// Pre-fill from URL params
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('checkin')  && checkin)  checkin.value  = urlParams.get('checkin');
if (urlParams.get('checkout') && checkout) checkout.value = urlParams.get('checkout');

// Pre-select room from URL
const roomParam = urlParams.get('room');
if (roomParam && ROOMS[roomParam]) {
  const radio = document.querySelector(`input[name="roomChoice"][value="${roomParam}"]`);
  if (radio) radio.checked = true;
  state.roomKey = roomParam;
}

function calcNights() {
  if (!checkin.value || !checkout.value) { durationDisplay.classList.remove('visible'); return 0; }
  const diff = (new Date(checkout.value) - new Date(checkin.value)) / 86400000;
  if (diff <= 0) { durationDisplay.classList.remove('visible'); return 0; }
  durationDisplay.textContent = `${diff} night${diff !== 1 ? 's' : ''} · ${formatDate(checkin.value)} → ${formatDate(checkout.value)}`;
  durationDisplay.classList.add('visible');
  return diff;
}

function formatDate(s) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

checkin.addEventListener('change', () => {
  checkout.min = checkin.value;
  if (checkout.value && checkout.value <= checkin.value) {
    const d = new Date(checkin.value); d.setDate(d.getDate() + 1);
    checkout.value = d.toISOString().split('T')[0];
  }
  state.nights = calcNights(); updateSummary();
});
checkout.addEventListener('change', () => { state.nights = calcNights(); updateSummary(); });

document.getElementById('toStep2').addEventListener('click', () => {
  let ok = true;
  if (!checkin.value)  { document.getElementById('checkinErr').textContent  = 'Please select a check-in date.';  ok = false; }
  else                   document.getElementById('checkinErr').textContent  = '';
  if (!checkout.value) { document.getElementById('checkoutErr').textContent = 'Please select a check-out date.'; ok = false; }
  else if (checkout.value <= checkin.value) { document.getElementById('checkoutErr').textContent = 'Check-out must be after check-in.'; ok = false; }
  else document.getElementById('checkoutErr').textContent = '';
  if (!ok) return;
  state.checkin  = checkin.value;
  state.checkout = checkout.value;
  state.nights   = calcNights();
  state.adults   = +document.getElementById('adults').value;
  state.children = +document.getElementById('children').value;
  updateSummary(); showStep(2);
});

// ---------- Step 2: Room ----------
document.getElementById('toStep3').addEventListener('click', () => {
  const sel = document.querySelector('input[name="roomChoice"]:checked');
  if (!sel) { document.getElementById('roomErr').textContent = 'Please select a room to continue.'; return; }
  document.getElementById('roomErr').textContent = '';
  state.roomKey = sel.value;
  updateSummary(); showStep(3);
});
document.getElementById('backToStep1').addEventListener('click', () => showStep(1));

// ---------- Step 3: Details ----------
document.getElementById('toStep4').addEventListener('click', () => {
  const fields = [
    { id: 'gFirstName', errId: 'gFirstNameErr', msg: 'First name required.' },
    { id: 'gLastName',  errId: 'gLastNameErr',  msg: 'Last name required.' },
    { id: 'gEmail',     errId: 'gEmailErr',     msg: 'Valid email required.' },
    { id: 'gPhone',     errId: 'gPhoneErr',     msg: 'Phone number required.' },
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
  const payEl = document.querySelector('input[name="payment"]:checked');
  state.payment = payEl ? payEl.value : 'card';
  buildConfirmSummary(); showStep(4);
});
document.getElementById('backToStep2').addEventListener('click', () => showStep(2));

// ---------- Step 4: Confirm ----------
function buildConfirmSummary() {
  const room  = ROOMS[state.roomKey];
  const total = room ? state.nights * room.price : 0;
  const payLabel = { card: 'Credit / Debit Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  const guestStr = `${state.adults} Adult${state.adults !== 1 ? 's' : ''}${state.children > 0 ? `, ${state.children} Child${state.children !== 1 ? 'ren' : ''}` : ''}`;
  document.getElementById('confirmSummary').innerHTML = `
    <div class="confirm-row"><label>Guest</label><span>${state.guest.firstName} ${state.guest.lastName}</span></div>
    <div class="confirm-row"><label>Email</label><span>${state.guest.email}</span></div>
    <div class="confirm-row"><label>Phone</label><span>${state.guest.phone}</span></div>
    <div class="confirm-row"><label>Country</label><span>${state.guest.country}</span></div>
    <div class="confirm-row"><label>Room</label><span>${room ? room.name : '—'}</span></div>
    <div class="confirm-row"><label>Beds</label><span>${room ? room.bed : '—'}</span></div>
    <div class="confirm-row"><label>Check-in</label><span>${formatDate(state.checkin)}</span></div>
    <div class="confirm-row"><label>Check-out</label><span>${formatDate(state.checkout)}</span></div>
    <div class="confirm-row"><label>Duration</label><span>${state.nights} night${state.nights !== 1 ? 's' : ''}</span></div>
    <div class="confirm-row"><label>Guests</label><span>${guestStr}</span></div>
    <div class="confirm-row"><label>Rate</label><span>£${room ? room.price : 0}/night</span></div>
    <div class="confirm-row"><label>Payment</label><span>${payLabel[state.payment] || state.payment}</span></div>
    <div class="confirm-row confirm-total"><label>Total</label><span>£${total.toLocaleString()}</span></div>
  `;
}

document.getElementById('confirmBooking').addEventListener('click', () => {
  const terms = document.getElementById('termsCheck');
  if (!terms.checked) { document.getElementById('termsErr').textContent = 'Please agree to the terms and conditions.'; return; }
  document.getElementById('termsErr').textContent = '';
  const btn = document.getElementById('confirmBooking');
  btn.textContent = 'Processing…'; btn.disabled = true;
  setTimeout(() => {
    const ref = 'BDW-' + Date.now().toString(36).toUpperCase().slice(-6);
    document.getElementById('successRef').textContent = `Booking Reference: ${ref}`;
    showStep(5);
  }, 1500);
});
document.getElementById('backToStep3').addEventListener('click', () => showStep(3));

// ---------- Summary Panel ----------
function updateSummary() {
  const datesEl = document.getElementById('summaryDates');
  const roomEl  = document.getElementById('summaryRoom');
  const totalEl = document.getElementById('summaryTotal');
  const totalAmt = document.getElementById('totalAmount');
  const totalDiv = document.getElementById('summaryTotalDivider');

  if (state.checkin && state.checkout && state.nights > 0) {
    const g = `${state.adults} adult${state.adults !== 1 ? 's' : ''}${state.children > 0 ? `, ${state.children} child${state.children !== 1 ? 'ren' : ''}` : ''}`;
    datesEl.innerHTML = `
      <div class="summary-item"><label>Check-in</label><span>${formatDate(state.checkin)}</span></div>
      <div class="summary-item"><label>Check-out</label><span>${formatDate(state.checkout)}</span></div>
      <div class="summary-item"><label>Nights</label><span>${state.nights}</span></div>
      <div class="summary-item"><label>Guests</label><span>${g}</span></div>
    `;
  } else {
    datesEl.innerHTML = '<p class="summary-empty">Select your dates to see pricing.</p>';
  }

  const room = state.roomKey ? ROOMS[state.roomKey] : null;
  if (room) {
    roomEl.innerHTML = `
      <div class="summary-item"><label>Room</label><span>${room.name}</span></div>
      <div class="summary-item"><label>Beds</label><span>${room.bed}</span></div>
      <div class="summary-item"><label>Rate</label><span>£${room.price}/night</span></div>
    `;
    if (state.nights > 0) {
      totalEl.style.display  = 'flex';
      totalDiv.style.display = 'block';
      totalAmt.textContent   = `£${(state.nights * room.price).toLocaleString()}`;
    }
  } else {
    roomEl.innerHTML = '<p class="summary-empty">No room selected yet.</p>';
    totalEl.style.display  = 'none';
    totalDiv.style.display = 'none';
  }
}

// Init
if (checkin.value && checkout.value) state.nights = calcNights();
if (state.roomKey) {
  /* radio already checked by URL param above */
}
updateSummary();
