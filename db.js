const { Pool } = require('pg');

if(!process.env.DATABASE_URL){
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ DATABASE CONNECTED');
  } catch (e) {
    console.error('❌ DATABASE CONNECTION FAILED:', e.message);
  }
})();

module.exports = {
  query: (text, params) => pool.query(text, params)
};
