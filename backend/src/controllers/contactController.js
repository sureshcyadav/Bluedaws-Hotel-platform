const { pool } = require('../config/db');
const { sendContactEmail } = require('../utils/mailer');

async function createContact(req, res) {
  const { first_name, last_name, email, phone = null, subject, message } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO contacts (first_name, last_name, email, phone, subject, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [first_name.trim(), last_name.trim(), email.trim(), phone || null, subject.trim(), message.trim()]
    );

    setImmediate(() => {
      sendContactEmail({
        firstName:    first_name.trim(),
        lastName:     last_name.trim(),
        email:        email.trim(),
        phone:        phone || null,
        subjectLabel: subject.trim(),
        message:      message.trim(),
      }).catch(err => console.error('[mailer] Failed to send contact email:', err.message));
    });

    return res.status(201).json({
      success: true,
      message: 'Message received. We will get back to you shortly.',
      data: { id: rows[0].id },
    });
  } catch (err) {
    console.error('[createContact]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save message. Please try again.' });
  }
}

module.exports = { createContact };
