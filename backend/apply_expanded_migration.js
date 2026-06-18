const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: '192.168.28.18',
  port: 5444,
  user: 'postgres',
  password: '47e54d3d4f129586c59b374693af501c',
  database: 'postgres',
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');

    const sqlPath = path.join(__dirname, '../supabase/migrations/20260616000005_expanded_features.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Reading migration file:', sqlPath);
    await client.query(sql);
    console.log('Migration 20260616000005_expanded_features.sql applied successfully.');
  } catch (err) {
    console.error('Error applying migration:', err.stack || err.message);
  } finally {
    await client.end();
  }
}

run();
