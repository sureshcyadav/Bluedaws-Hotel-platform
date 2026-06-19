// ---------- Quick Booking Bar: date validation ----------
const qbCheckin  = document.getElementById('qbCheckin');
const qbCheckout = document.getElementById('qbCheckout');
const qbSubmit   = document.getElementById('qbSubmit');

if (qbCheckin && qbCheckout) {
  const today = new Date().toISOString().split('T')[0];
  qbCheckin.min  = today;
  qbCheckout.min = today;
  qbCheckin.value = today;

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  qbCheckout.value = tomorrow;

  qbCheckin.addEventListener('change', () => {
    qbCheckout.min = qbCheckin.value;
    if (qbCheckout.value && qbCheckout.value <= qbCheckin.value) {
      const next = new Date(qbCheckin.value);
      next.setDate(next.getDate() + 1);
      qbCheckout.value = next.toISOString().split('T')[0];
    }
  });

  qbSubmit.addEventListener('click', (e) => {
    if (!qbCheckin.value || !qbCheckout.value) {
      e.preventDefault();
      qbCheckin.style.borderBottom = '2px solid #c0392b';
      return;
    }
    const params = new URLSearchParams({
      checkin:  qbCheckin.value,
      checkout: qbCheckout.value,
      guests:   document.getElementById('qbGuests').value,
    });
    window.location.href = `booking.html?${params}`;
  });
}

// ---------- Active nav on scroll ----------
const sections   = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.nav-links a[href^="#"], .nav-links a[href^="index.html"]');

const sectionObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navAnchors.forEach(a => { a.style.color = ''; a.style.borderBottomColor = ''; });
    const id    = entry.target.id;
    const match = document.querySelector(`.nav-links a[href="#${id}"]`);
    if (match && !match.classList.contains('nav-cta')) {
      match.style.color = 'var(--gold)';
      match.style.borderBottomColor = 'var(--gold)';
    }
  });
}, { threshold: 0.35 });

sections.forEach(s => sectionObs.observe(s));
