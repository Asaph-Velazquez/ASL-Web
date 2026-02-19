# Script para iniciar el proyecto ASL-Web completo
# Ejecuta el servidor WebSocket y el panel web simultáneamente

Write-Host "🚀 Iniciando ASL-Web System..." -ForegroundColor Green
Write-Host ""

if (-not (Test-Path "server")) {
    Write-Host "❌ No se encontró la carpeta 'server'" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Verificando dependencias..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias del panel web..." -ForegroundColor Cyan
    npm install
}

if (-not (Test-Path "server/node_modules")) {
    Write-Host "Instalando dependencias del servidor..." -ForegroundColor Cyan
    Set-Location server
    npm install
    Set-Location ..
}

Write-Host ""
Write-Host "✅ Dependencias verificadas" -ForegroundColor Green
Write-Host ""
Write-Host "🔌 Iniciando Servidor WebSocket en ws://localhost:8080" -ForegroundColor Magenta
Write-Host "🌐 Iniciando Panel Web en http://localhost:5173" -ForegroundColor Magenta
Write-Host ""
Write-Host "Presiona Ctrl+C para detener ambos servicios" -ForegroundColor Yellow
Write-Host ""

# Iniciar servidor WebSocket en background
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location server
    npm start
}

# Esperar un momento para que el servidor inicie
Start-Sleep -Seconds 2

# Iniciar el panel web
npm run dev

# Limpiar al salir
Stop-Job $serverJob
Remove-Job $serverJob
