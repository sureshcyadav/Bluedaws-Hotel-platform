// ---------- Contact form validation ----------
const form        = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');

if (form) {
  const fields = {
    firstName: { el: form.querySelector('#firstName'), err: form.querySelector('#firstNameErr'), msg: 'Please enter your first name.' },
    lastName:  { el: form.querySelector('#lastName'),  err: form.querySelector('#lastNameErr'),  msg: 'Please enter your last name.' },
    email:     { el: form.querySelector('#email'),     err: form.querySelector('#emailErr'),     msg: 'Please enter a valid email address.' },
    subject:   { el: form.querySelector('#subject'),   err: form.querySelector('#subjectErr'),   msg: 'Please select a subject.' },
    message:   { el: form.querySelector('#message'),   err: form.querySelector('#messageErr'),   msg: 'Please enter your message.' },
  };

  function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function validateField(key) {
    const { el, err, msg } = fields[key];
    let valid = el.value.trim() !== '';
    if (key === 'email') valid = validateEmail(el.value.trim());
    el.classList.toggle('error', !valid);
    err.textContent = valid ? '' : msg;
    return valid;
  }

  Object.keys(fields).forEach(key => {
    fields[key].el.addEventListener('blur', () => validateField(key));
    fields[key].el.addEventListener('input', () => {
      if (fields[key].el.classList.contains('error')) validateField(key);
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const allValid = Object.keys(fields).map(validateField).every(Boolean);
    if (!allValid) return;

    const btn = form.querySelector('#submitBtn');
    btn.textContent = 'Sending…';
    btn.disabled = true;

    setTimeout(() => {
      formSuccess.classList.add('visible');
      form.reset();
      btn.textContent = 'Send Message';
      btn.disabled = false;
      Object.values(fields).forEach(({ el }) => el.classList.remove('error'));
      setTimeout(() => formSuccess.classList.remove('visible'), 7000);
    }, 1200);
  });
}
