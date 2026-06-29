// ======================================================================
// BLUEDAWS HOTEL — Contact Form
// ======================================================================

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

  const subjectLabels = {
    booking:   'Booking Enquiry',
    group:     'Group Booking (6+ guests)',
    checkin:   'Check-in / Check-out',
    breakfast: 'Breakfast Information',
    luggage:   'Luggage Storage',
    other:     'General Enquiry',
  };

  function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function validateField(key) {
    const { el, err, msg } = fields[key];
    let valid = el.value.trim() !== '';
    if (key === 'email') valid = validateEmail(el.value.trim());
    el.classList.toggle('error', !valid);
    if (err) err.textContent = valid ? '' : msg;
    return valid;
  }

  Object.keys(fields).forEach(key => {
    fields[key].el.addEventListener('blur', () => validateField(key));
    fields[key].el.addEventListener('input', () => {
      if (fields[key].el.classList.contains('error')) validateField(key);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const allValid = Object.keys(fields).map(validateField).every(Boolean);
    if (!allValid) return;

    const btn = form.querySelector('#submitBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Sending…';
    btn.disabled = true;

    const data = {
      firstName:    fields.firstName.el.value.trim(),
      lastName:     fields.lastName.el.value.trim(),
      email:        fields.email.el.value.trim(),
      phone:        (form.querySelector('#phone') || {}).value || '',
      subjectLabel: subjectLabels[fields.subject.el.value] || fields.subject.el.value,
      message:      fields.message.el.value.trim(),
    };

    const API_BASE = 'https://api.bluedawshotel.com';

    try {
      // Save to database
      await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: data.firstName,
          last_name:  data.lastName,
          email:      data.email,
          phone:      data.phone || null,
          subject:    data.subjectLabel,
          message:    data.message,
        }),
      });

      if (formSuccess) formSuccess.classList.add('visible');
      form.reset();
      Object.values(fields).forEach(({ el }) => el.classList.remove('error'));
      setTimeout(() => { if (formSuccess) formSuccess.classList.remove('visible'); }, 8000);
    } catch (err) {
      if (formSuccess) {
        formSuccess.textContent = `We couldn't send your message. Please email us at bluedawsprivatehotel@gmail.com`;
        formSuccess.classList.add('visible');
      }
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}
