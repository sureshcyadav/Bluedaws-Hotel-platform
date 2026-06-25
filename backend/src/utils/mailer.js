const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return _transporter;
}

function row(label, value) {
  return `
    <tr style="border-top:1px solid #f1f5f9">
      <td style="padding:9px 0;font-size:11.5px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-weight:600;width:130px">${label}</td>
      <td style="padding:9px 0;color:#1e293b">${value}</td>
    </tr>`;
}

function headerHtml(subtitle) {
  return `
    <div style="background:#0f172a;padding:24px 28px;border-radius:8px 8px 0 0;text-align:center">
      <div style="color:#c9a96e;font-size:22px;font-weight:700;letter-spacing:3px">BLUEDAWS</div>
      <div style="color:#94a3b8;font-size:11px;letter-spacing:2px;margin-top:2px">${subtitle}</div>
    </div>`;
}

function wrapHtml(header, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto">
  ${header}
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:28px 28px 24px;border-radius:0 0 8px 8px">
    ${body}
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0">
    Bluedaws Private Hotel · 16-20 Argyle Square, London WC1H 8AS
  </p>
</div>
</body></html>`;
}

// ── Sent immediately when guest makes a booking ───────────────────────────────
async function sendBookingEmails({ ref, guest, roomLabel, checkin, checkout, nights, guests, total, payment, requests, dateReceived }) {
  const t = getTransporter();
  if (!t) { console.log('[mailer] Email credentials not set — skipping'); return; }

  const payLabels = { card: 'Credit / Debit Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  const payStr    = payLabels[payment] || payment;
  const hotelAddr = process.env.GMAIL_USER;

  // Hotel notification
  const notifBody = `
    <h2 style="margin:0 0 4px;color:#0f172a;font-size:18px">New Booking Received</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:13px">${dateReceived}</p>
    <table style="width:100%;border-collapse:collapse">
      ${row('Reference', `<strong style="font-size:16px">${ref}</strong>`)}
      ${row('Guest', `${guest.firstName} ${guest.lastName}`)}
      ${row('Email', `<a href="mailto:${guest.email}" style="color:#c9a96e">${guest.email}</a>`)}
      ${row('Phone', guest.phone)}
      ${row('Country', guest.country)}
      ${row('Room', roomLabel)}
      ${row('Check-in', checkin)}
      ${row('Check-out', checkout)}
      ${row('Nights', nights)}
      ${row('Guests', guests)}
      ${row('Total', `<strong>£${total}</strong>`)}
      ${row('Payment', payStr)}
      ${requests ? row('Special Requests', requests) : ''}
    </table>`;

  await t.sendMail({
    from: `"Bluedaws Bookings" <${hotelAddr}>`,
    to: hotelAddr,
    subject: `New Booking ${ref} — ${guest.firstName} ${guest.lastName}`,
    html: wrapHtml(headerHtml('BOOKING NOTIFICATION'), notifBody),
  });

  // Guest: booking received (NOT confirmed yet)
  const receivedBody = `
    <h2 style="margin:0 0 16px;color:#c9a96e;font-size:20px">Booking Received</h2>
    <p style="margin:0 0 8px;color:#1e293b">Dear <strong>${guest.firstName}</strong>,</p>
    <p style="margin:0 0 22px;color:#475569;font-size:14px;line-height:1.6">
      Thank you! We have received your booking request at Bluedaws Private Hotel.
      We will review and send you a <strong>confirmation email within 1 hour</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse">
      ${row('Reference', `<strong style="font-size:18px;color:#0f172a">${ref}</strong>`)}
      ${row('Room', roomLabel)}
      ${row('Check-in', `${checkin} &nbsp;<span style="color:#64748b;font-size:12px">(from 1:00 PM)</span>`)}
      ${row('Check-out', `${checkout} &nbsp;<span style="color:#64748b;font-size:12px">(by 12:00 PM)</span>`)}
      ${row('Nights', nights)}
      ${row('Guests', guests)}
      ${row('Total', `<strong style="font-size:16px;color:#0f172a">£${total}</strong>`)}
      ${row('Payment', payStr)}
      ${requests ? row('Special Requests', requests) : ''}
    </table>
    <div style="margin:24px 0 20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e">
      ⏳ Your booking is <strong>pending confirmation</strong>. You will receive a confirmation email within 1 hour.
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b">
      Questions? Email <a href="mailto:reservations@bluedawshotel.com" style="color:#c9a96e">reservations@bluedawshotel.com</a>
    </p>
    <p style="margin:0;color:#475569;font-size:14px">Warm regards,<br><strong>The Bluedaws Team</strong></p>`;

  await t.sendMail({
    from: `"Bluedaws Private Hotel" <${hotelAddr}>`,
    to: guest.email,
    subject: `Booking Received ${ref} — Bluedaws Private Hotel`,
    html: wrapHtml(headerHtml('PRIVATE HOTEL'), receivedBody),
  });

  console.log(`[mailer] Sent booking-received emails for ${ref} → hotel + ${guest.email}`);
}

// ── Sent when admin clicks Confirm in the admin portal ────────────────────────
async function sendBookingConfirmedEmail({ ref, guest, roomLabel, checkin, checkout, nights, guests, total, payment, requests }) {
  const t = getTransporter();
  if (!t) { console.log('[mailer] Email credentials not set — skipping confirmation email'); return; }

  const payLabels = { card: 'Credit / Debit Card', bank: 'Bank Transfer', payathotel: 'Pay at Hotel' };
  const payStr    = payLabels[payment] || payment;
  const hotelAddr = process.env.GMAIL_USER;

  const confirmedBody = `
    <h2 style="margin:0 0 16px;color:#059669;font-size:20px">✓ Booking Confirmed</h2>
    <p style="margin:0 0 8px;color:#1e293b">Dear <strong>${guest.firstName}</strong>,</p>
    <p style="margin:0 0 22px;color:#475569;font-size:14px;line-height:1.6">
      Great news! Your booking at Bluedaws Private Hotel is <strong>confirmed</strong>.
      We look forward to welcoming you!
    </p>
    <table style="width:100%;border-collapse:collapse">
      ${row('Reference', `<strong style="font-size:18px;color:#0f172a">${ref}</strong>`)}
      ${row('Room', roomLabel)}
      ${row('Check-in', `${checkin} &nbsp;<span style="color:#64748b;font-size:12px">(from 1:00 PM)</span>`)}
      ${row('Check-out', `${checkout} &nbsp;<span style="color:#64748b;font-size:12px">(by 12:00 PM)</span>`)}
      ${row('Nights', nights)}
      ${row('Guests', guests)}
      ${row('Total', `<strong style="font-size:16px;color:#0f172a">£${total}</strong>`)}
      ${row('Payment', payStr)}
      ${requests ? row('Special Requests', requests) : ''}
    </table>
    <div style="margin:24px 0 20px;padding:14px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#166534">
      ✓ <strong>Confirmed</strong> — What's included: Free Wi-Fi · Breakfast · Heating &amp; Fan · Hair Dryer · Towels &amp; Linen
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b">
      Questions? Email <a href="mailto:reservations@bluedawshotel.com" style="color:#c9a96e">reservations@bluedawshotel.com</a>
    </p>
    <p style="margin:0;color:#475569;font-size:14px">Warm regards,<br><strong>The Bluedaws Team</strong></p>`;

  await t.sendMail({
    from: `"Bluedaws Private Hotel" <${hotelAddr}>`,
    to: guest.email,
    subject: `Booking Confirmed ${ref} — Bluedaws Private Hotel`,
    html: wrapHtml(headerHtml('PRIVATE HOTEL'), confirmedBody),
  });

  console.log(`[mailer] Sent booking-confirmed email for ${ref} → ${guest.email}`);
}

// ── Sent when admin cancels a booking ────────────────────────────────────────
async function sendBookingCancelledEmail({ ref, guest, roomLabel, checkin, checkout, nights, total }) {
  const t = getTransporter();
  if (!t) { console.log('[mailer] Email credentials not set — skipping cancellation email'); return; }

  const hotelAddr = process.env.GMAIL_USER;

  const cancelledBody = `
    <h2 style="margin:0 0 16px;color:#dc2626;font-size:20px">Booking Cancellation Notice</h2>
    <p style="margin:0 0 8px;color:#1e293b">Dear <strong>${guest.firstName}</strong>,</p>
    <p style="margin:0 0 22px;color:#475569;font-size:14px;line-height:1.6">
      We regret to inform you that the following booking has been <strong>cancelled</strong>.
      We apologise for any inconvenience caused.
    </p>
    <table style="width:100%;border-collapse:collapse">
      ${row('Reference', `<strong style="font-size:18px;color:#0f172a">${ref}</strong>`)}
      ${row('Room', roomLabel)}
      ${row('Check-in', checkin)}
      ${row('Check-out', checkout)}
      ${row('Nights', nights)}
      ${row('Total', `<strong style="font-size:16px;color:#0f172a">£${total}</strong>`)}
    </table>
    <div style="margin:24px 0 20px;padding:14px 16px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;font-size:13px;color:#991b1b">
      This booking has been cancelled. If you paid by bank transfer or card, please allow 5–10 business days for any refund to appear.
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b">
      If this cancellation was made in error, or if you would like to rebook, please contact us at
      <a href="mailto:reservations@bluedawshotel.com" style="color:#c9a96e">reservations@bluedawshotel.com</a>
    </p>
    <p style="margin:0;color:#475569;font-size:14px">Warm regards,<br><strong>The Bluedaws Team</strong></p>`;

  await t.sendMail({
    from: `"Bluedaws Private Hotel" <${hotelAddr}>`,
    to: guest.email,
    subject: `Booking Cancellation ${ref} — Bluedaws Private Hotel`,
    html: wrapHtml(headerHtml('PRIVATE HOTEL'), cancelledBody),
  });

  console.log(`[mailer] Sent booking-cancelled email for ${ref} → ${guest.email}`);
}

// ── Sent when a contact form enquiry is submitted ─────────────────────────────
async function sendContactEmail({ firstName, lastName, email, phone, subjectLabel, message }) {
  const t = getTransporter();
  if (!t) { console.log('[mailer] Email credentials not set — skipping contact email'); return; }

  const hotelAddr = process.env.GMAIL_USER;

  const body = `
    <h2 style="margin:0 0 4px;color:#0f172a;font-size:18px">New Website Enquiry</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:13px">${subjectLabel}</p>
    <table style="width:100%;border-collapse:collapse">
      ${row('From', `${firstName} ${lastName}`)}
      ${row('Email', `<a href="mailto:${email}" style="color:#c9a96e">${email}</a>`)}
      ${row('Phone', phone || 'Not provided')}
      ${row('Subject', subjectLabel)}
      ${row('Message', `<span style="white-space:pre-wrap">${message}</span>`)}
    </table>`;

  await t.sendMail({
    from: `"Bluedaws Website" <${hotelAddr}>`,
    to: hotelAddr,
    replyTo: email,
    subject: `Website Enquiry — ${subjectLabel} (${firstName} ${lastName})`,
    html: wrapHtml(headerHtml('ENQUIRY NOTIFICATION'), body),
  });

  console.log(`[mailer] Sent contact email from ${email}`);
}

// ── Sent when admin replies to a contact enquiry ──────────────────────────────
async function sendContactReplyEmail({ to, firstName, subject, originalMessage, replyText }) {
  const t = getTransporter();
  if (!t) { console.log('[mailer] Email credentials not set — skipping reply email'); return; }

  const hotelAddr = process.env.GMAIL_USER;

  const body = `
    <p style="margin:0 0 8px;color:#1e293b">Dear <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6">
      Thank you for contacting Bluedaws Private Hotel. Here is our response to your enquiry:
    </p>
    <div style="background:#f8fafc;border-left:4px solid #c9a96e;padding:16px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;color:#1e293b;font-size:14px;line-height:1.75">
      ${replyText.replace(/\n/g, '<br>')}
    </div>
    <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:12px;color:#94a3b8">
      <strong style="display:block;margin-bottom:6px;color:#64748b">Your original message:</strong>
      <em>${originalMessage.replace(/\n/g, '<br>')}</em>
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b">
      Need anything else? Reply to this email or call us directly.
    </p>
    <p style="margin:0;color:#475569;font-size:14px">Warm regards,<br><strong>The Bluedaws Team</strong></p>`;

  await t.sendMail({
    from: `"Bluedaws Private Hotel" <${hotelAddr}>`,
    to,
    subject: `Re: ${subject} — Bluedaws Private Hotel`,
    html: wrapHtml(headerHtml('PRIVATE HOTEL'), body),
  });

  console.log(`[mailer] Sent reply email to ${to}`);
}

module.exports = { sendBookingEmails, sendBookingConfirmedEmail, sendBookingCancelledEmail, sendContactEmail, sendContactReplyEmail };
