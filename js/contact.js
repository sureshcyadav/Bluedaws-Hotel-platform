// ======================================================================
// BLUEDAWS HOTEL — Contact Form + EmailJS
// ======================================================================

// Init EmailJS if configured
if (typeof emailjs !== 'undefined' && typeof EMAILJS !== 'undefined' && EMAILJS.publicKey !== 'YOUR_PUBLIC_KEY') {
  emailjs.init({ publicKey: EMAILJS.publicKey });
}

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

    try {
      if (typeof emailjs !== 'undefined' && typeof EMAILJS !== 'undefined' && EMAILJS.publicKey !== 'YOUR_PUBLIC_KEY') {
        await emailjs.send(EMAILJS.serviceId, EMAILJS.contactTemplate, {
          to_email:      EMAILJS.hotelEmail,
          from_name:     `${data.firstName} ${data.lastName}`,
          from_email:    data.email,
          phone:         data.phone || 'Not provided',
          subject_label: data.subjectLabel,
          message:       data.message,
        });
      }
      // Show success regardless (even if EmailJS isn't configured yet)
      if (formSuccess) formSuccess.classList.add('visible');
      form.reset();
      Object.values(fields).forEach(({ el }) => el.classList.remove('error'));
      setTimeout(() => { if (formSuccess) formSuccess.classList.remove('visible'); }, 8000);
    } catch (err) {
      // Email failed — show a fallback message with the hotel email
      if (formSuccess) {
        formSuccess.textContent = `We couldn't send your message automatically. Please email us directly at reservations@bluedawshotel.com`;
        formSuccess.classList.add('visible');
      }
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}
