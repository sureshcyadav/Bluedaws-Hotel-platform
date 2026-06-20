const { pool } = require('../config/db');

async function createContact(req, res) {
  const { first_name, last_name, email, phone = null, subject, message } = req.body;

  const sql = `
    INSERT INTO contacts (first_name, last_name, email, phone, subject, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  try {
    const [result] = await pool.query(sql, [
      first_name.trim(), last_name.trim(), email.trim(),
      phone || null, subject.trim(), message.trim(),
    ]);

    return res.status(201).json({
      success: true,
      message: 'Message received. We will get back to you shortly.',
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error('[createContact] DB error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save message. Please try again.' });
  }
}

module.exports = { createContact };
