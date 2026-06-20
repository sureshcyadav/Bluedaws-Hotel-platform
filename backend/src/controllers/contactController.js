const { pool } = require('../config/db');

async function createContact(req, res) {
  const { first_name, last_name, email, phone = null, subject, message } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO contacts (first_name, last_name, email, phone, subject, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [first_name.trim(), last_name.trim(), email.trim(), phone || null, subject.trim(), message.trim()]
    );

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
