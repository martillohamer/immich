# =====================================================================
# SYSTEM LAUNCHER T-800 - IMMICH NATIVE WINDOWS ENVIRONMENT
# =====================================================================
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "   INITIATING T-800 CYBER-TERMINAL IMMICH SYSTEM    " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Green

$ROOT_DIR = "C:\Users\astur\Desktop\immich-main"

# 1. VERIFICAR Y ARRANCAR DOCKER CONTAINERS
Write-Host "`n[SYS 1/3] Verificando contenedores de Docker (Postgres & Redis)..." -ForegroundColor Yellow
try {
    docker start immich_postgres immich_redis | Out-Null
    Write-Host "[OK] Contenedores immich_postgres e immich_redis activos." -ForegroundColor Green
} catch {
    Write-Host "[WARN] No se pudo iniciar Docker o los contenedores ya estan corriendo." -ForegroundColor Yellow
}

# 2. LIMPIEZA DE PUERTOS OCUPADOS (2283, 3001, 3002, 3003)
Write-Host "`n[SYS 2/3] Liberando puertos 2283 y 3001-3003 de procesos huérfanos..." -ForegroundColor Yellow
$PORTS = @(2283, 3001, 3002, 3003)
foreach ($PORT in $PORTS) {
    $PIDS = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($PIDS) {
        foreach ($PID_TO_KILL in $PIDS) {
            try {
                Stop-Process -Id $PID_TO_KILL -Force -ErrorAction SilentlyContinue
                Write-Host "[KILL] Puerto $PORT liberado (PID: $PID_TO_KILL)." -ForegroundColor Red
            } catch {}
        }
    }
}
Write-Host "[OK] Puertos limpios y listos para enlace." -ForegroundColor Green

# 3. ARRANCAR BACKEND Y FRONTEND EN PARALELO
Write-Host "`n[SYS 3/3] Desplegando servicios NestJS Backend (2283) y Vite Frontend..." -ForegroundColor Cyan

# Terminal Backend (NestJS)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT_DIR\server'; Write-Host '--- STARTING NESTJS BACKEND (PORT 2283) ---' -ForegroundColor Green; pnpm run start:dev"

# Esperar 3 segundos para estabilidad de inicio
Start-Sleep -Seconds 3

# Terminal Frontend (Vite)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT_DIR\web'; Write-Host '--- STARTING VITE CYBER-TERMINAL FRONTEND ---' -ForegroundColor Cyan; pnpm run dev"

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host "   [SYSTEM READY] Accede a http://localhost:3001     " -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green