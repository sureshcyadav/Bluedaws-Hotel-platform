// ---------- Navbar scroll behaviour ----------
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

// ---------- Mobile nav toggle ----------
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
}

// ---------- Announcement banner ----------
(function () {
  const API_BASE = 'https://bluedaws-hotel-platform.onrender.com';
  fetch(API_BASE + '/api/settings')
    .then(r => r.json())
    .then(function (res) {
      if (!res || !res.data) return;
      const d = res.data;
      if (d.ann_active !== 'true' || !d.ann_text) return;
      const type = ['info', 'warning', 'success'].includes(d.ann_type) ? d.ann_type : 'info';
      const bar = document.createElement('div');
      bar.className = 'site-announcement ann-' + type;
      bar.innerHTML = '<span class="ann-text">' + d.ann_text.replace(/</g, '&lt;') + '</span>'
        + '<button class="ann-close" aria-label="Dismiss">&times;</button>';
      bar.querySelector('.ann-close').addEventListener('click', function () {
        bar.style.height = bar.offsetHeight + 'px';
        requestAnimationFrame(function () {
          bar.style.height = '0';
          bar.style.opacity = '0';
          setTimeout(function () { bar.remove(); }, 300);
        });
      });
      document.body.insertBefore(bar, document.body.firstChild);
    })
    .catch(function () {});
})();

// ---------- Scroll reveal ----------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (!entry.isIntersecting) return;
    setTimeout(() => entry.target.classList.add('visible'), i * 80);
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
