// ---------- Filter ----------
const galleryFilterBtns = document.querySelectorAll('.gallery-filter-btn');
const galleryItems = document.querySelectorAll('.gallery-item');

galleryFilterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    galleryFilterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat;
    galleryItems.forEach(item => {
      const match = cat === 'all' || item.dataset.cat === cat;
      item.classList.toggle('hidden', !match);
    });
  });
});

// ---------- Lightbox ----------
const lightbox      = document.getElementById('lightbox');
const lightboxImg   = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxCounter = document.getElementById('lightboxCounter');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev  = document.getElementById('lightboxPrev');
const lightboxNext  = document.getElementById('lightboxNext');

// Build image data from gallery items
const images = [];
galleryItems.forEach(item => {
  const imgEl   = item.querySelector('.gallery-img');
  const caption = item.querySelector('.gallery-item-overlay span');
  const bg      = imgEl.style.backgroundImage;
  const url     = bg.replace(/url\(['"]?(.+?)['"]?\)/, '$1');
  images.push({ url, caption: caption ? caption.textContent : '' });
});

let currentIndex = 0;
let visibleImages = [...images];

function openLightbox(index) {
  const activeItems = [...galleryItems].filter(i => !i.classList.contains('hidden'));
  visibleImages = activeItems.map(item => {
    const imgEl   = item.querySelector('.gallery-img');
    const caption = item.querySelector('.gallery-item-overlay span');
    const bg      = imgEl.style.backgroundImage;
    const url     = bg.replace(/url\(['"]?(.+?)['"]?\)/, '$1');
    return { url, caption: caption ? caption.textContent : '' };
  });

  currentIndex = index < visibleImages.length ? index : 0;
  showImage(currentIndex);
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
}

function showImage(index) {
  const item = visibleImages[index];
  if (!item) return;
  lightboxImg.style.opacity = '0';
  setTimeout(() => {
    lightboxImg.style.backgroundImage = `url('${item.url}')`;
    lightboxImg.style.opacity = '1';
  }, 150);
  lightboxCaption.textContent  = item.caption;
  lightboxCounter.textContent  = `${index + 1} / ${visibleImages.length}`;
}

// Attach click on each gallery item
galleryItems.forEach((item, i) => {
  item.addEventListener('click', () => {
    const activeItems = [...galleryItems].filter(el => !el.classList.contains('hidden'));
    const visIndex    = activeItems.indexOf(item);
    openLightbox(visIndex >= 0 ? visIndex : 0);
  });
});

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

lightboxPrev.addEventListener('click', () => {
  currentIndex = (currentIndex - 1 + visibleImages.length) % visibleImages.length;
  showImage(currentIndex);
});

lightboxNext.addEventListener('click', () => {
  currentIndex = (currentIndex + 1) % visibleImages.length;
  showImage(currentIndex);
});

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  lightboxPrev.click();
  if (e.key === 'ArrowRight') lightboxNext.click();
  if (e.key === 'Escape')     closeLightbox();
});

// Touch swipe support
let touchStartX = 0;
lightbox.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
lightbox.addEventListener('touchend', e => {
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 50) diff > 0 ? lightboxNext.click() : lightboxPrev.click();
});
