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
  var _annEl   = null;
  var _promoEl = null;

  // Stack: announcement (top:0) → promo (top:annH) → navbar (top:annH+promoH)
  // Also push inner-page hero content down so it clears all bars
  function adjustLayout() {
    var nav    = document.querySelector('nav.navbar');
    var annH   = (_annEl   && _annEl.parentNode)   ? _annEl.offsetHeight   : 0;
    var promoH = (_promoEl && _promoEl.parentNode) ? _promoEl.offsetHeight : 0;
    var barsH  = annH + promoH;

    if (_promoEl) _promoEl.style.top = annH + 'px';
    if (nav)      nav.style.top      = barsH + 'px';

    // Inner-page hero titles use padding-top:80px for the navbar.
    // Increase it by the bars height so text clears all three layers.
    var phc = document.querySelector('.page-hero-content');
    if (phc) phc.style.paddingTop = (80 + barsH) + 'px';
  }

  fetch(API_BASE + '/api/settings')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.data) return;
      var d = res.data;
      window._bdwSettings = d;

      // ── Announcement bar (z-index 1010, top:0 via CSS) ──────────
      if (d.ann_active === 'true' && d.ann_text) {
        var type = ['info', 'warning', 'success'].includes(d.ann_type) ? d.ann_type : 'info';
        _annEl = document.createElement('div');
        _annEl.className = 'site-announcement ann-' + type;
        _annEl.innerHTML = '<span class="ann-text">' + d.ann_text.replace(/</g, '&lt;') + '</span>'
          + '<button class="ann-close" aria-label="Dismiss">&times;</button>';
        _annEl.querySelector('.ann-close').addEventListener('click', function () {
          _annEl.style.height  = _annEl.offsetHeight + 'px';
          requestAnimationFrame(function () {
            _annEl.style.height  = '0';
            _annEl.style.opacity = '0';
            setTimeout(function () {
              if (_annEl && _annEl.parentNode) _annEl.parentNode.removeChild(_annEl);
              _annEl = null;
              adjustLayout();
            }, 300);
          });
        });
        document.body.insertBefore(_annEl, document.body.firstChild);
      }

      // ── Promotion banner (z-index 1005, top set by adjustLayout) ─
      if (d.promo_active === 'true' && d.promo_title) {
        function safe(s) { return String(s || '').replace(/</g, '&lt;'); }
        var badge  = d.promo_badge  ? '<span class="promo-badge-pill">' + safe(d.promo_badge)  + '</span>' : '';
        var desc   = d.promo_desc   ? '<p class="promo-desc">'           + safe(d.promo_desc)   + '</p>'    : '';
        var expiry = d.promo_expiry ? '<p class="promo-expiry">Valid until ' + safe(d.promo_expiry) + '</p>' : '';

        _promoEl = document.createElement('section');
        _promoEl.className = 'promo-banner';
        _promoEl.innerHTML = '<div class="container"><div class="promo-inner">'
          + '<div class="promo-left">' + badge
          + '<div><h3 class="promo-title">' + safe(d.promo_title) + '</h3>' + desc + '</div></div>'
          + '<div class="promo-right">' + expiry
          + '<a href="booking.html" class="btn btn-primary btn-sm">Book &amp; Save</a></div>'
          + '</div></div>';
        document.body.insertBefore(_promoEl, document.body.firstChild);

        // Booking page: inject a compact promo card into the summary panel
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

      // Run layout after browser has painted the new elements
      requestAnimationFrame(function () {
        adjustLayout();
        window.addEventListener('resize', adjustLayout, { passive: true });
      });
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
