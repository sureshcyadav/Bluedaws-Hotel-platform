require('dotenv').config();
const app                  = require('./src/app');
const { testConnection }   = require('./src/config/db');

const PORT = process.env.PORT || 3000;

(async () => {
  await testConnection();           // exits if DB unreachable
  app.listen(PORT, () => {
    console.log(`✓ Bluedaws Hotel API running on port ${PORT}`);
    console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health check: http://localhost:${PORT}/api/health`);
  });
})();
