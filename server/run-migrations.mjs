
import { Pool } from "pg";
import { Kysely, PostgresDialect, Migrator } from "kysely";
import { FileMigrationProvider } from "kysely/migration";
import { promises as fs } from "fs";
import * as path from "path";

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:5432/immich" })
  })
});

const migrationFolder = path.resolve("dist/schema/migrations");
console.log("Buscando migraciones compiladas en:", migrationFolder);

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder
  })
});

console.log("Ejecutando migraciones...");
const { error, results } = await migrator.migrateToLatest();

if (results) {
  results.forEach((it) => {
    if (it.status === "Success") {
      console.log(`[OK] Migración "${it.migrationName}" ejecutada con éxito.`);
    } else if (it.status === "Error") {
      console.error(`[ERROR] Falló la migración "${it.migrationName}".`);
    }
  });
}

if (error) {
  console.error("Error general durante las migraciones:", error);
  await db.destroy();
  process.exit(1);
}

console.log("¡Todas las migraciones se aplicaron con éxito!");
await db.destroy();
process.exit(0);

