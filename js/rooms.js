// ---------- Filter ----------
const filterBtns  = document.querySelectorAll('.filter-btn');
const roomCards   = document.querySelectorAll('.room-card[data-type]');
const resultsCount = document.getElementById('resultsCount');
const noResults   = document.getElementById('noResults');

let currentFilter = 'all';
let currentSort   = 'default';

function applyFilterAndSort() {
  const visible = [];

  roomCards.forEach(card => {
    const match = currentFilter === 'all' || card.dataset.type === currentFilter;
    card.classList.toggle('filtered', !match);
    if (match) visible.push(card);
  });

  const grid = document.getElementById('roomsGrid');

  if (currentSort !== 'default' && visible.length > 1) {
    visible.sort((a, b) => {
      if (currentSort === 'price-asc') return +a.dataset.price - +b.dataset.price;
      if (currentSort === 'price-desc') return +b.dataset.price - +a.dataset.price;
      if (currentSort === 'size-desc') return +b.dataset.size - +a.dataset.size;
      return 0;
    });
    visible.forEach(card => grid.appendChild(card));
  }

  const count = visible.length;
  if (resultsCount) resultsCount.textContent = `Showing ${count} room type${count !== 1 ? 's' : ''}`;
  if (noResults) noResults.style.display = count === 0 ? 'block' : 'none';
}

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilterAndSort();
  });
});

const sortSelect = document.getElementById('sortSelect');
if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    applyFilterAndSort();
  });
}

// ---------- Pre-select filter from URL ----------
const urlParams = new URLSearchParams(window.location.search);
const typeParam = urlParams.get('type');
if (typeParam) {
  const btn = document.querySelector(`.filter-btn[data-filter="${typeParam}"]`);
  if (btn) btn.click();
}

// ---------- Reveal stagger for room cards ----------
const cardObs = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (!entry.isIntersecting) return;
    setTimeout(() => entry.target.classList.add('visible'), i * 100);
    cardObs.unobserve(entry.target);
  });
}, { threshold: 0.08 });

roomCards.forEach(c => cardObs.observe(c));

// ---------- Dynamic prices from backend ----------
function applyBDWPrices(data) {
  document.querySelectorAll('.room-card[data-price-key]').forEach(function(card) {
    var price = parseFloat(data[card.dataset.priceKey]);
    if (!isNaN(price) && price > 0) {
      var amt = card.querySelector('.price-amount');
      if (amt) amt.textContent = '£' + price;
      card.dataset.price = price;
    }
  });
}
window.applyBDWPrices = applyBDWPrices;

// Layer 1: localStorage — instant, set by admin portal on same browser
try {
  var _lp = JSON.parse(localStorage.getItem('bdw_prices') || 'null');
  if (_lp && typeof _lp === 'object') applyBDWPrices(_lp);
} catch(_) {}

// Layer 2: prices.js <script async> tag already ran (common when backend is awake)
if (window.__BDW_PRICES__) applyBDWPrices(window.__BDW_PRICES__);

// Layer 3: main.js fetch result — hook in so we get prices as soon as main.js resolves
window._onBdwSettingsLoaded = applyBDWPrices;
if (window._bdwSettings) applyBDWPrices(window._bdwSettings);

// Layer 4: own fetch with retries (backend cold-start safety net)
(function fetchPricesFallback() {
  var url = 'https://api.bluedawshotel.com/api/settings';
  function attempt(retriesLeft) {
    fetch(url, { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(res) { if (res && res.data) applyBDWPrices(res.data); })
      .catch(function() {
        if (retriesLeft > 0) setTimeout(function() { attempt(retriesLeft - 1); }, 8000);
      });
  }
  attempt(3);
}());
