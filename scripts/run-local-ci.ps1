param(
  [string]$EnvFile = ".env",
  [switch]$NoBuild,
  [switch]$WithDockerTests,
  [switch]$BackupAfter
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "`n== $msg ==" -ForegroundColor Cyan
}

$build = -not $NoBuild

if (-not (Test-Path $EnvFile)) {
  if ($EnvFile -eq ".env" -and (Test-Path ".env.example")) {
    Write-Step "Create .env from .env.example"
    Copy-Item ".env.example" ".env" -Force
  } else {
    throw "Missing $EnvFile. Provide -EnvFile or create it first."
  }
}

$frontendUrlLine = (Select-String -Path $EnvFile -Pattern '^FRONTEND_URL=' -ErrorAction SilentlyContinue | Select-Object -First 1)
$adminUrlLine = (Select-String -Path $EnvFile -Pattern '^ADMIN_URL=' -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($frontendUrlLine -or $adminUrlLine) {
  Write-Host "Note: FRONTEND_URL/ADMIN_URL found in $EnvFile. For Docker runs, docker-compose.yml defaults to :7220/:7221 unless overridden." -ForegroundColor Yellow
}

Write-Step "Bring up docker compose stack"
if ($build) {
  docker compose --env-file $EnvFile up --build -d
} else {
  docker compose --env-file $EnvFile up -d
}

Write-Step "Run smoke test"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-docker.ps1

if ($WithDockerTests) {
  Write-Step "Run docker pytest e2e (docker-compose.test.yml)"
  docker compose -f docker-compose.test.yml --env-file $EnvFile up --build --abort-on-container-exit --exit-code-from tests
  docker compose -f docker-compose.test.yml --env-file $EnvFile down -v | Out-Null
}

$backupPath = $null
if ($BackupAfter) {
  Write-Step "Backup database"
  $backupPath = powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1 | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { throw "db-backup.ps1 failed (exit=$LASTEXITCODE)" }
}

Write-Host "`nLocal CI OK." -ForegroundColor Green

Write-Host "`n--- Handoff summary ---" -ForegroundColor Cyan
Write-Host "Customer (Docker): http://localhost:7220/quote"
Write-Host "Admin (Docker):     http://localhost:7221/admin"
Write-Host "API docs:           http://localhost:7222/docs"
Write-Host "Default Admin (dev): admin / admin1234"
if ($WithDockerTests) { Write-Host "Docker pytest e2e:   ran" }
if ($BackupAfter -and $backupPath) { Write-Host "DB backup file:      $backupPath" }
Write-Host "----------------------"

