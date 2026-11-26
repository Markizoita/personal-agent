require('./env');
const { Client } = require('pg');
const fs = require('fs');

const sqlFile = process.argv[2];
const sql = fs.readFileSync(sqlFile, 'utf8');

const client = new Client({
  connectionString: process.env.PG_CONN,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log('connected ok');
    await client.query(sql);
    console.log('SQL executed successfully:', sqlFile);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
