@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health -TimeoutSec 1 | Out-Null } catch { Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory '%CD%' -WindowStyle Minimized; Start-Sleep -Seconds 2 }"
start "" "http://localhost:8787/"
