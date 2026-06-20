const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'bluedaws_hotel',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✓ MySQL connected — database:', process.env.DB_NAME || 'bluedaws_hotel');
    conn.release();
  } catch (err) {
    console.error('✗ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
