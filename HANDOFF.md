# 📋 HANDOFF TÉCNICO - Transferencia del Proyecto Immich (Fork Quiz + Obsidian)

> **Tag de referencia**: `martillo-martillohamer`
> **Estado**: ✅ Estructura verificada, migraciones aplicadas, entorno configurado

---

## 1. ESTADO ACTUAL DEL PROYECTO

### Estado General
- **Base de datos**: 100/100 migraciones aplicadas exitosamente
- **Redis**: Conectado y operativo
- **PostgreSQL**: Healthy en puerto 5432
- **Entorno Windows**: Configurado y probado con Node.js v24

### Tag de Git
```bash
git tag -a martillo-martillohamer -m "Estado estable con migraciones completadas y configuración de Windows validada"
git push origin martillo-martillohamer
```

### Punto de Restauración
```bash
git reset --hard martillo-martillohamer
```

---

## 2. HITOS TÉCNICOS SUPERADOS EN WINDOWS

### 2.1. Solución a Migraciones con Node.js 24

**Problema**: `ERR_UNSUPPORTED_ESM_URL_SCHEME` al ejecutar `sql-tools` con rutas de Windows (`C:\...`).

**Causa raíz**: Node.js 24 en Windows requiere que los imports dinámicos de ESM usen el esquema `file:///` cuando se trata de rutas absolutas.

**Solución implementada**:
- Creado `server/run-migrations-native.mjs` que utiliza `pathToFileURL` de la librería nativa `node:url`
- Los archivos de migración se importan dinámicamente con URLs `file://` correctamente formateadas
- Uso de `kysely/migration` con proveedor personalizado

### 2.2. Configuración de Variables de Entorno

**Variables forzadas para Windows**:
```env
DB_HOST=127.0.0.1          # Evita resolución ENOTFOUND
DB_HOSTNAME=127.0.0.1      # Mismo valor, redundante para compatibilidad
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE_NAME=immich
REDIS_HOST=127.0.0.1       # Evita enrutamiento a través de red Docker
REDIS_PORT=6379
```

**Justificación**: El contenedor Docker usa nombres de host (`database`, `redis`) internos. En Windows local, debemos usar `127.0.0.1` para conexión directa.

### 2.3. Scripts de Package.json Actualizados

En `server/package.json`, todos los scripts de migración usan:
```json
"migrations:run": "sql-tools -u postgres://postgres:postgres@127.0.0.1:5432/immich migrations run"
```

En lugar de:
```json
"migrations:run": "sql-tools -u ${DB_URL:-postgres://postgres:postgres@localhost:5432/immich} migrations run"
```

---

## 3. ESTRUCTURA DE RESPALDO

### Archivos Clave Modificados

| Archivo | Propósito | Fecha |
|---------|-----------|-------|
| `server/package.json` | Scripts de migración con URLs directas | 2026-11-05 |
| `server/run-migrations-native.mjs` | Script de migraciones para Windows | 2026-11-05 |
| `README.md` | Documentación principal actualizada | 2026-11-05 |
| `server/.env` | Variables de entorno verificadas | Ya existente |

### Archivos de Configuración Verificados

| Archivo | Estado | Notas |
|---------|--------|-------|
| `web/vite.config.ts` | ✅ Correcto | Proxy `/api` → `http://localhost:2283` |
| `server/.env` | ✅ Correcto | Todos los hosts apuntan a `127.0.0.1` |

---

## 4. PRÓXIMOS PASOS SUGERIDOS

### Para Cualquier Nuevo Desarrollador/Agente:

1. **Verificar contenedores Docker**:
   ```bash
   docker ps | grep immich
   # Debería mostrar: immich_postgres, immich_redis
   ```

2. **Verificar migraciones**:
   ```bash
   docker exec immich_postgres psql -U postgres -d immich -c "SELECT COUNT(*) FROM kysely_migrations;"
   # Debería retornar 100
   ```

3. **Ejecutar migraciones (si es necesario)**:
   ```bash
   cd server
   node run-migrations-native.mjs
   ```

4. **Arrancar backend**:
   ```bash
   cd server
   pnpm run start:dev
   ```

5. **Arrancar frontend**:
   ```bash
   cd web
   pnpm run dev
   ```

6. **Verificar funcionamiento**:
   - Navegar a `http://localhost:3002/`
   - La pantalla de registro del administrador debe cargar

### Verificación de Tablas Principales

```sql
-- Verificar tablas críticas existen
SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
ORDER BY tablename 
LIMIT 10;
-- Debería incluir: users, assets, albums, sessions, etc.
```

---

## 5. TROUBLESHOOTING

### Error: `Migration failed: ERR_UNSUPPORTED_ESM_URL_SCHEME`
**Solución**: Usar `node run-migrations-native.mjs` en lugar del script original de sql-tools.

### Error: `ENOTFOUND database`  
**Solución**: Asegurar que `DB_HOSTNAME=127.0.0.1` en `.env`.

### Error: `connection refused` en puerto 5432
**Solución**: 
```bash
docker start immich_postgres
```

### Error: `connection refused` en puerto 6379
**Solución**:
```bash
docker start immich_redis
```

---

## 6. PUERTOS Y SERVICIOS

| Servicio | Puerto | Host | Uso |
|----------|--------|------|-----|
| PostgreSQL | 5432 | 127.0.0.1 | Base de datos principal |
| Redis | 6379 | 127.0.0.1 | Cache y colas |
| Backend API | 2283 | localhost | NestJS API |
| Frontend Web | 3002 | localhost | Vite SvelteKit |
| ML Service | 3080 | localhost | Opcional (requiere Docker) |

---

## 7. CONTACT Y RECURSOS

- **Documentación Immich**: https://docs.immich.app/
- **Discord Community**: https://discord.immich.app
- **GitHub Original**: https://github.com/immich-app/immich

---

*Documento generado: 2026-11-05*
*Versión: martillo-martillohamer*
*Autor: Ingeniero Principal de Node.js y DevOps*