require('./env');
const { Client } = require('pg');
const sql = process.argv[2];
const client = new Client({ connectionString: process.env.PG_CONN, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    await client.connect();
    const res = await client.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
