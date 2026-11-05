# =====================================================================
# Script Maestro de Arranque - Immich (Fork Quiz + Obsidian)
# Entorno Nativo Windows [Tag: martillo-martillohamer]
# =====================================================================

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  INICIANDO INFRAESTRUCTURA COMPLETA DE IMMICH...     " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Encender contenedores de Docker (PostgreSQL y Redis)
Write-Host "[1/3] Encendiendo servicios Docker (PostgreSQL y Redis)..." -ForegroundColor Yellow
docker start immich_postgres
docker start immich_redis

# 2. Levantar el Backend (NestJS) en una nueva ventana con las variables de entorno protegidas
Write-Host "[2/3] Lanzando el Backend (NestJS en puerto 2283)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd server; `$env:DB_HOST='127.0.0.1'; `$env:DB_HOSTNAME='127.0.0.1'; `$env:REDIS_HOST='127.0.0.1'; pnpm run start:dev"

# 3. Levantar el Frontend (Vite) en otra nueva ventana
Write-Host "[3/3] Lanzando el Frontend (Vite en puerto 3002)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd web; pnpm run dev"

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  ¡TODO EN MARCHA CON ÉXITO!                          " -ForegroundColor Green
Write-Host "  - Backend API: http://localhost:2283               " -ForegroundColor White
Write-Host "  - Frontend Web: http://localhost:3002              " -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Green