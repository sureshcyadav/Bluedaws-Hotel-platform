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
  if (resultsCount) resultsCount.textContent = `Showing ${count} accommodation${count !== 1 ? 's' : ''}`;
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
