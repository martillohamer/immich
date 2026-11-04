const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'immich'
});

async function runMigrations() {
  await client.connect();
  
  const migrationsDir = './dist/schema/migrations';
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') && f !== 'index.js')
    .sort();
  
  await client.query('CREATE TABLE IF NOT EXISTS kysely_migrations (name TEXT PRIMARY KEY, ts TIMESTAMP WITH TIME ZONE DEFAULT NOW())');
  
  const applied = await client.query('SELECT name FROM kysely_migrations');
  const appliedNames = new Set(applied.rows.map(r => r.name));
  
  for (const file of files) {
    const name = file.replace('.js', '');
    if (appliedNames.has(name)) {
      console.log(`Migration ${name} already applied`);
      continue;
    }
    
    console.log(`Running migration: ${name}`);
    try {
      const migration = require(path.join(migrationsDir, file));
      await migration.up(client);
      await client.query('INSERT INTO kysely_migrations (name) VALUES ($1)', [name]);
      console.log(`Migration ${name} completed`);
    } catch (e) {
      console.error(`Migration ${name} failed:`, e.message);
      break;
    }
  }
  
  await client.end();
  console.log('Migrations complete');
}

runMigrations().catch(e => { console.error(e); process.exit(1); });