param(
  [string]$OutDir = ".\\backups",
  [string]$Service = "db"
)

$ErrorActionPreference = "Stop"

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$dir = Resolve-Path -Path $OutDir -ErrorAction SilentlyContinue
if (-not $dir) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
  $dir = Resolve-Path -Path $OutDir
}

$name = "fft-evquote-$ts.sql"
$outPath = Join-Path $dir $name

Write-Host "Backing up to $outPath"

$envFile = ".env"
if (-not (Test-Path $envFile)) {
  throw "Missing .env at repo root. Copy .env.example to .env first."
}

$dbUser = (Select-String -Path $envFile -Pattern '^DB_USER=' | Select-Object -First 1 | ForEach-Object { $_.Line.Split('=',2)[1] })
$dbName = (Select-String -Path $envFile -Pattern '^DB_NAME=' | Select-Object -First 1 | ForEach-Object { $_.Line.Split('=',2)[1] })
if (-not $dbUser) { $dbUser = "ev_charger" }
if (-not $dbName) { $dbName = "ev_charger_quote" }

docker compose exec -T $Service pg_dump -U $dbUser $dbName | Out-File -FilePath $outPath -Encoding utf8
if ($LASTEXITCODE -ne 0) {
  try { Remove-Item -Force $outPath -ErrorAction SilentlyContinue } catch {}
  throw "pg_dump failed (exit=$LASTEXITCODE)"
}

Write-Host "Backup OK."

Write-Output $outPath

