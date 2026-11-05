# Script: iniciar-todo.ps1
# Inicia Immich Backend y Frontend en Windows
# Requiere permisos de administrador para firewall

param(
    [switch]$SkipFirewall = $false
)

Write-Host "=== Iniciando Immich (Quiz + Obsidian Fork) ===" -ForegroundColor Cyan

# 1. Configurar puertos en Firewall (si se ejecuta como admin)
if (-not $SkipFirewall) {
    Write-Host "Configurando reglas de firewall..." -ForegroundColor Yellow
    try {
        netsh advfirewall firewall add rule name="Immich API" dir=in action=allow protocol=TCP localport=2283 profile=private 2>$null
        netsh advfirewall firewall add rule name="Immich Web" dir=in action=allow protocol=TCP localport=3002 profile=private 2>$null
        Write-Host "Puertos 2283 y 3002 configurados en firewall" -ForegroundColor Green
    } catch {
        Write-Warning "No se pudieron configurar reglas de firewall (ejecutar como administrador si es necesario)"
    }
}

# 2. Verificar contenedores Docker
Write-Host "Verificando contenedores Docker..." -ForegroundColor Yellow
$postgres = docker ps --format "{{.Names}}" | Where-Object { $_ -eq "immich_postgres" }
$redis = docker ps --format "{{.Names}}" | Where-Object { $_ -eq "immich_redis" }

if ($postgres) {
    Write-Host "  ✓ PostgreSQL (immich_postgres) está activo" -ForegroundColor Green
} else {
    Write-Host "  ⚠ PostgreSQL no está activo, iniciando..." -ForegroundColor Yellow
    docker start immich_postgres 2>$null
}

if ($redis) {
    Write-Host "  ✓ Redis (immich_redis) está activo" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Redis no está activo, iniciando..." -ForegroundColor Yellow
    docker start immich_redis 2>$null
}

# 3. Verificar .env
$envFile = Join-Path $PSScriptRoot "server\.env"
if (Test-Path $envFile) {
    $immichHost = Select-String -Path $envFile -Pattern "^IMMICH_HOST=" | ForEach-Object { $_.Line -replace ".*=", "" }
    if ($immichHost -ne "0.0.0.0") {
        Write-Host "  ⚠ Corrigiendo IMMICH_HOST a 0.0.0.0" -ForegroundColor Yellow
        (Get-Content $envFile) -replace "^IMMICH_HOST=.*", "IMMICH_HOST=0.0.0.0" | Set-Content $envFile
    }
}

# 4. Iniciar Backend
Write-Host "Iniciando Backend (NestJS) en puerto 2283..." -ForegroundColor Cyan
$serverDir = Join-Path $PSScriptRoot "server"
if (Test-Path "$serverDir\dist\main.js") {
    cd $serverDir
    Start-Process -FilePath "pnpm" -ArgumentList "run start:dev" -WindowStyle Minimized -WorkingDirectory $serverDir
    Write-Host "  Backend iniciado (PID: $(Get-Process -Name 'node' | Select-Object -First 1).Id)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Ejecutar 'pnpm run build' primero" -ForegroundColor Yellow
}

# 5. Iniciar Frontend
Write-Host "Iniciando Frontend (Vite) en puerto 3002..." -ForegroundColor Cyan
$webDir = Join-Path $PSScriptRoot "web"
if (Test-Path "$webDir\src\main.ts") {
    cd $webDir
    Start-Process -FilePath "pnpm" -ArgumentList "run dev" -WindowStyle Minimized -WorkingDirectory $webDir
    Write-Host "  Frontend iniciado" -ForegroundColor Green
}

# 6. Resumen
cd $PSScriptRoot
Write-Host "" -ForegroundColor White
Write-Host "=== Resumen de Servicios ===" -ForegroundColor Cyan
Write-Host "  Backend API:  http://localhost:2283" -ForegroundColor White
Write-Host "  Frontend Web: http://localhost:3002" -ForegroundColor White
Write-Host ""
Write-Host "Desde móvil/usuario: http://$((Get-NetIPAddress -AddressFamily IPv4 | Select-Object -First 1).IPAddress):2283" -ForegroundColor White
Write-Host ""
Write-Host "=== Servidor listo ===" -ForegroundColor Green