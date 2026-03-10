param(
  [Parameter(Mandatory = $true)]
  [string]$File,
  [string]$Service = "db"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $File)) {
  throw "Backup file not found: $File"
}

$envFile = ".env"
if (-not (Test-Path $envFile)) {
  throw "Missing .env at repo root. Copy .env.example to .env first."
}

$dbUser = (Select-String -Path $envFile -Pattern '^DB_USER=' | Select-Object -First 1 | ForEach-Object { $_.Line.Split('=',2)[1] })
$dbName = (Select-String -Path $envFile -Pattern '^DB_NAME=' | Select-Object -First 1 | ForEach-Object { $_.Line.Split('=',2)[1] })
if (-not $dbUser) { $dbUser = "ev_charger" }
if (-not $dbName) { $dbName = "ev_charger_quote" }

Write-Host "Restoring $File into $dbName ..."
Get-Content -Raw $File | docker compose exec -T $Service psql -U $dbUser -d $dbName
if ($LASTEXITCODE -ne 0) { throw "psql restore failed (exit=$LASTEXITCODE)" }
Write-Host "Restore OK."

