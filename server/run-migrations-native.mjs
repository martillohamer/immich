import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { Pool } from 'pg';
import { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { PostgresJSDialect } from 'kysely-postgres-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'immich',
  max: 10,
});

const db = new Kysely({
  dialect: new PostgresJsDialect({ pool }),
});

const migrationProvider = {
  async getMigrations() {
    const migrationsDir = join(__dirname, 'dist/schema/migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js') && f !== 'index.js')
      .sort();
    
    const migrations = {};
    for (const file of files) {
      const name = file.replace('.js', '');
      const filePath = join(migrationsDir, file);
      const fileUrl = pathToFileURL(filePath);
      const module = await import(fileUrl.href);
      migrations[name] = {
        name,
        up: async (db) => {
          if (module.up) await module.up(db);
        },
        down: async (db) => {
          if (module.down) await module.down(db);
        },
      };
    }
    return migrations;
  },
};

const migrator = new Migrator({
  db,
  provider: migrationProvider,
  migrationsTableNames: {
    name: 'kysely_migrations',
    table: 'kysely_migrations_lock',
  },
});

console.log('Starting migrations...');
const { error, results } = await migrator.migrateToLatest();

if (results) {
  for (const result of results) {
    if (result.status === 'Success') {
      console.log(`Migration "${result.migrationName}" succeeded`);
    } else if (result.status === 'Skipped') {
      console.log(`Migration "${result.migrationName}" was already applied`);
    } else {
      console.warn(`Migration "${result.migrationName}" failed`);
    }
  }
}

if (error) {
  console.error('Migration error:', error);
  await db.destroy();
  process.exit(1);
}

console.log('Migrations completed successfully');
await db.destroy();