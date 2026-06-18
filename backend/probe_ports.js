const { Client } = require('pg');

async function testPort(port, user) {
  const client = new Client({
    host: '192.168.28.18',
    port,
    user,
    password: '47e54d3d4f129586c59b374693af501c',
    database: 'postgres',
  });
  try {
    await client.connect();
    console.log(`SUCCESS on port ${port} with user ${user}`);
    await client.end();
  } catch (err) {
    console.log(`FAILED on port ${port} with user ${user}: ${err.message}`);
  }
}

async function run() {
  await testPort(5436, 'postgres');
  await testPort(5435, 'postgres');
  await testPort(5434, 'postgres');
  await testPort(5436, 'postgres.postgres');
}

run();
