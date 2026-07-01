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
  var API_BASE   = 'https://api.bluedawshotel.com';
  var siteHeader = document.getElementById('site-header');
  var nav        = siteHeader ? siteHeader.querySelector('nav.navbar') : null;

  // Keep inner-page hero titles below the growing/shrinking header
  function adjustPagePadding() {
    if (!siteHeader) return;
    var h   = siteHeader.offsetHeight;
    var phc = document.querySelector('.page-hero-content');
    if (phc) phc.style.paddingTop = h + 'px';
  }

  // Re-run whenever the header changes height (bar dismissed, resize)
  if (siteHeader && window.ResizeObserver) {
    new ResizeObserver(adjustPagePadding).observe(siteHeader);
  }
  window.addEventListener('resize', adjustPagePadding, { passive: true });

  fetch(API_BASE + '/api/settings', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.data) return;
      var d = res.data;
      window._bdwSettings = d;
      if (typeof window._onBdwSettingsLoaded === 'function') window._onBdwSettingsLoaded(d);

      // ── Announcement bar ──────────────────────────────────────
      if (d.ann_active === 'true' && d.ann_text && siteHeader && nav) {
        var annType = ['info', 'warning', 'success'].includes(d.ann_type) ? d.ann_type : 'info';
        var annEl   = document.createElement('div');
        annEl.className = 'site-announcement ann-' + annType;
        annEl.innerHTML = '<span class="ann-text">' + d.ann_text.replace(/</g, '&lt;') + '</span>'
          + '<button class="ann-close" aria-label="Dismiss">&times;</button>';
        annEl.querySelector('.ann-close').addEventListener('click', function () {
          annEl.style.height   = annEl.offsetHeight + 'px';
          annEl.style.overflow = 'hidden';
          requestAnimationFrame(function () {
            annEl.style.height  = '0';
            annEl.style.opacity = '0';
            setTimeout(function () { annEl.remove(); }, 300);
          });
        });
        siteHeader.insertBefore(annEl, nav); // above the navbar
      }

      // ── Promotion banner ──────────────────────────────────────
      if (d.promo_active === 'true' && d.promo_title && siteHeader && nav) {
        function safe(s) { return String(s || '').replace(/</g, '&lt;'); }
        var badge  = d.promo_badge  ? '<span class="promo-badge-pill">' + safe(d.promo_badge)  + '</span>' : '';
        var desc   = d.promo_desc   ? '<p class="promo-desc">'           + safe(d.promo_desc)   + '</p>'    : '';
        var expiry = d.promo_expiry ? '<p class="promo-expiry">Valid until ' + safe(d.promo_expiry) + '</p>' : '';

        var promoEl = document.createElement('section');
        promoEl.className = 'promo-banner';
        promoEl.innerHTML = '<div class="container"><div class="promo-inner">'
          + '<div class="promo-left">' + badge
          + '<div><h3 class="promo-title">' + safe(d.promo_title) + '</h3>' + desc + '</div></div>'
          + '<div class="promo-right">' + expiry
          + '<a href="booking.html" class="btn btn-primary btn-sm">Book &amp; Save</a></div>'
          + '</div></div>';

        siteHeader.insertBefore(promoEl, nav); // above the navbar, below ann

        // Booking page: compact promo card in the summary panel
        var summaryNote = document.querySelector('.summary-note');
        if (summaryNote && !summaryNote.parentNode.querySelector('.promo-summary-card')) {
          var card = document.createElement('div');
          card.className = 'promo-summary-card';
          card.innerHTML = (badge ? badge + ' ' : '')
            + '<strong>' + safe(d.promo_title) + '</strong>'
            + (d.promo_desc   ? '<br><span>' + safe(d.promo_desc)   + '</span>' : '')
            + (d.promo_expiry ? '<br><small>Valid until ' + safe(d.promo_expiry) + '</small>' : '');
          summaryNote.parentNode.insertBefore(card, summaryNote);
        }
      }

      // ── Check-in / Check-out times ────────────────────────────
      if (d.checkin_time) {
        document.querySelectorAll('[data-bdw="checkin_time"]').forEach(function(el) {
          el.textContent = d.checkin_time;
        });
      }
      if (d.checkout_time) {
        document.querySelectorAll('[data-bdw="checkout_time"]').forEach(function(el) {
          el.textContent = d.checkout_time;
        });
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
