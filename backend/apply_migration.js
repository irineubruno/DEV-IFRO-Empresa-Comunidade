const { Client } = require('pg');

const client = new Client({
  host: '192.168.28.18',
  port: 5444,
  user: 'postgres.postgres',
  password: '47e54d3d4f129586c59b374693af501c',
  database: 'postgres',
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');

    const sql = `
      ALTER TABLE public.linhas_rurais
        ADD COLUMN IF NOT EXISTS tipo_via TEXT,
        ADD COLUMN IF NOT EXISTS jurisdicao TEXT,
        ADD COLUMN IF NOT EXISTS pavimentada BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT 'CENSIPAM_WFS_2019',
        ADD COLUMN IF NOT EXISTS ano_base INTEGER DEFAULT 2019;

      DELETE FROM public.linhas_rurais;
    `;
    
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Error applying migration:', err.message);
  } finally {
    await client.end();
  }
}

run();
