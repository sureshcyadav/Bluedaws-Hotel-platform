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

// ---------- Global settings: announcement + promotion ----------
(function () {
  var API_BASE = 'https://bluedaws-hotel-platform.onrender.com';
  fetch(API_BASE + '/api/settings')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.data) return;
      var d = res.data;
      window._bdwSettings = d;

      // Announcement bar (top of body, all pages)
      if (d.ann_active === 'true' && d.ann_text) {
        var type = ['info', 'warning', 'success'].includes(d.ann_type) ? d.ann_type : 'info';
        var ann = document.createElement('div');
        ann.className = 'site-announcement ann-' + type;
        ann.innerHTML = '<span class="ann-text">' + d.ann_text.replace(/</g, '&lt;') + '</span>'
          + '<button class="ann-close" aria-label="Dismiss">&times;</button>';
        ann.querySelector('.ann-close').addEventListener('click', function () {
          ann.style.height = ann.offsetHeight + 'px';
          requestAnimationFrame(function () {
            ann.style.height = '0';
            ann.style.opacity = '0';
            setTimeout(function () { ann.remove(); }, 300);
          });
        });
        document.body.insertBefore(ann, document.body.firstChild);
      }

      // Promotion banner (below navbar, all pages)
      if (d.promo_active === 'true' && d.promo_title) {
        function safe(s) { return String(s || '').replace(/</g, '&lt;'); }
        var badge  = d.promo_badge  ? '<span class="promo-badge-pill">' + safe(d.promo_badge)  + '</span>' : '';
        var desc   = d.promo_desc   ? '<p class="promo-desc">'           + safe(d.promo_desc)   + '</p>'    : '';
        var expiry = d.promo_expiry ? '<p class="promo-expiry">Valid until ' + safe(d.promo_expiry) + '</p>' : '';
        var promo = document.createElement('section');
        promo.className = 'promo-banner';
        promo.innerHTML = '<div class="container"><div class="promo-inner">'
          + '<div class="promo-left">' + badge + '<div><h3 class="promo-title">' + safe(d.promo_title) + '</h3>' + desc + '</div></div>'
          + '<div class="promo-right">' + expiry + '<a href="booking.html" class="btn btn-primary btn-sm">Book &amp; Save</a></div>'
          + '</div></div>';
        var nav = document.querySelector('nav.navbar');
        if (nav) nav.insertAdjacentElement('afterend', promo);
        else document.body.appendChild(promo);

        // Booking page: also inject promo card into the summary panel
        var summaryNote = document.querySelector('.summary-note');
        if (summaryNote) {
          var card = document.createElement('div');
          card.className = 'promo-summary-card';
          card.innerHTML = (badge ? badge + ' ' : '')
            + '<strong>' + safe(d.promo_title) + '</strong>'
            + (d.promo_desc   ? '<br><span>' + safe(d.promo_desc)   + '</span>' : '')
            + (d.promo_expiry ? '<br><small>Valid until ' + safe(d.promo_expiry) + '</small>' : '');
          summaryNote.parentNode.insertBefore(card, summaryNote);
        }
      }
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
