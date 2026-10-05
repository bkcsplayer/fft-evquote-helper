# Mirror the PRODUCTION database + uploads into the LOCAL dev stack (STEPS T5, Review R6).
# Production is read-only here: pg_dump / tar are streamed over ssh straight into local files
# (cmd.exe '>' is byte-safe; a PowerShell pipe or '>' would re-encode binary). Nothing is written on the VPS.
# The local DB is overwritten only after a binary local backup and the MIRROR confirmation.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$R = '/www/wwwroot/evquote.khtain.com/fft-evquote-helper'
$DC = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml')
$SSH = 'ssh -n -o ControlMaster=no -o ControlPath=none vultr-vps'  # control-master socket is broken; -n (and $null-piped docker exec) keep stdin for the MIRROR prompt
$localBackup = ".\backups\local-pre-mirror-$ts.dump"
$prodDump = ".\backups\prod-mirror-$ts.dump"
$prodTar = ".\backups\prod-uploads-$ts.tar"

function Step($desc, [scriptblock]$cmd) {
    Write-Host "==> $desc"
    if ($DryRun) { Write-Host '    [dry-run] skipped'; return }
    & $cmd
}

function Check($what) {
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

function Assert-Dump($path) {
    if (-not (Test-Path $path)) { throw "$path missing" }
    $head = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes((Resolve-Path $path))[0..4])
    if ($head -ne 'PGDMP') { throw "$path is not a pg_dump -Fc archive (header '$head')" }
}

# Read-only probe, no network, no sends: send_email must refuse before any SMTP connect.
$gateProbe = @'
from app.services.notification_service import notify_redirect_enabled, _apply_redirect
from app.services.email_service import send_email
assert notify_redirect_enabled() is True, 'NOTIFY_REDIRECT is not on'
to, subj, body = _apply_redirect(is_sms=True, to='+14035550000', subject=None, body='probe')
assert to == '+15879669668' and body.startswith('[REDIRECTED'), (to, body)
to, subj, body = _apply_redirect(is_sms=False, to='probe@example.com', subject='s', body='<p>x</p>')
assert to == 'cool@khtain.com' and subj.startswith('[REDIRECTED'), (to, subj)
try:
    send_email(to_email='probe@example.com', subject='probe', html='<p>probe</p>')
    raise SystemExit('TRANSPORT GUARD MISSING')
except RuntimeError as e:
    assert 'NOTIFY_REDIRECT' in str(e), str(e)
    print('transport guard refused:', e)
print('REDIRECT GATE OK')
'@

function Invoke-Gate {
    $out = $gateProbe | docker @DC exec -T backend python -
    $out | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0 -or -not ($out -contains 'REDIRECT GATE OK')) { throw 'REDIRECT GATE FAILED - stop, do not open the admin UI' }
}

# ---------- pre-flight (read-only, also in dry-run) ----------
Write-Host '==> pre-flight (read-only)'
foreach ($f in 'docker-compose.yml', 'docker-compose.dev.yml') {
    if (-not (Select-String -Path $f -SimpleMatch 'NOTIFY_REDIRECT: "on"' -Quiet)) { throw "$f lacks NOTIFY_REDIRECT: `"on`"" }
}
& cmd /c "$SSH true"
Check 'ssh vultr-vps true'
$running = docker @DC ps --status running --services
Check 'docker compose ps'
foreach ($svc in 'db', 'backend') {
    if (-not ($running -contains $svc)) { throw "local service '$svc' is not running" }
}
Write-Host '    redirect gate on the CURRENT local backend (before any prod data lands):'
Invoke-Gate

# ---------- local safety backup ----------
Step 'local safety backup (pg_dump -Fc in container)' {
    New-Item -ItemType Directory -Force .\backups | Out-Null
    $null | docker @DC exec -T db sh -c 'pg_dump -Fc -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/local-pre-mirror.dump'
    Check 'local pg_dump'
    $null | docker @DC exec -T db sh -c 'pg_restore -l /tmp/local-pre-mirror.dump > /dev/null'
    Check 'local backup integrity (pg_restore -l)'
    docker @DC cp db:/tmp/local-pre-mirror.dump $localBackup
    Check 'docker cp local backup'
    $null | docker @DC exec -T db rm /tmp/local-pre-mirror.dump
    Assert-Dump $localBackup
    if ((Get-Item $localBackup).Length -le 1KB) { throw "$localBackup is too small" }
    Write-Host "    $localBackup $((Get-Item $localBackup).Length) bytes"
}

# ---------- [PROD read-only] stream dump + uploads to local ----------
Step '[PROD read-only] stream pg_dump -Fc + uploads tar to local files' {
    # the remote command is double-quoted so Win32 ssh keeps the single quotes (else $POSTGRES_USER expands on the host)
    & cmd /c "$SSH `"docker compose --project-directory $R -f $R/docker-compose.vps.yml exec -T db sh -c 'pg_dump -Fc -U `$POSTGRES_USER -d `$POSTGRES_DB'`" > $prodDump"
    Check 'remote pg_dump'
    Assert-Dump $prodDump
    & cmd /c "$SSH tar -C $R/uploads -cf - . > $prodTar"
    Check 'remote uploads tar'
    tar -tf $prodTar | Out-Null
    Check 'uploads tar integrity'
    docker @DC cp $prodDump db:/tmp/prod-mirror.dump
    Check 'docker cp prod dump'
    $toc = $null | docker @DC exec -T db sh -c 'pg_restore -l /tmp/prod-mirror.dump'
    Check 'prod dump integrity (pg_restore -l)'
    if (-not ($toc | Select-String -SimpleMatch 'TABLE DATA public service_bookings' -Quiet)) { throw 'prod dump lacks service_bookings data' }
    Write-Host "    $prodDump $((Get-Item $prodDump).Length) bytes; $prodTar $((Get-Item $prodTar).Length) bytes"
}

# ---------- [DESTRUCTIVE] restore ----------
Step '[DESTRUCTIVE] restore prod dump over the LOCAL database' {
    $answer = Read-Host 'Type MIRROR to overwrite the LOCAL database'
    if ($answer -ne 'MIRROR') { throw 'not confirmed - local database untouched' }
    docker @DC stop backend
    Check 'stop backend'
    $null | docker @DC exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -U $POSTGRES_USER -d $POSTGRES_DB /tmp/prod-mirror.dump'
    Check 'pg_restore (rolled back as a whole on error)'
    $null | docker @DC exec -T db rm /tmp/prod-mirror.dump
    (Get-Date).ToUniversalTime().ToString('o') | Set-Content -Encoding ASCII .\backups\last-mirror-utc.txt
}

# ---------- uploads ----------
Step 'uploads: back up local, then extract prod archive' {
    Copy-Item .\uploads ".\backups\uploads-local-$ts" -Recurse
    tar -xf $prodTar -C .\uploads
    Check 'tar -xf'
}

# ---------- restart + hard gates ----------
Step 'restart backend (alembic upgrade head) + hard gates' {
    docker @DC up -d backend
    Check 'up backend'
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        curl.exe -fs -o NUL http://localhost:7222/health
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ok) { throw 'backend /health did not come up' }
    Invoke-Gate
    $cur = $null | docker @DC exec -T backend alembic current
    Write-Host "    alembic current: $cur"
    if (-not ($cur -match 'c7d8e9f0a1b2 \(head\)')) { throw 'migration not at c7d8e9f0a1b2 (head)' }
    $logoProbe = @'
from app.database import SessionLocal
from app.models.models import SystemSetting
s = SessionLocal().query(SystemSetting).filter(SystemSetting.key == 'brand_profile').one_or_none()
print((s.value or {}).get('logo_url') or '' if s else '')
'@
    $logo = ($logoProbe | docker @DC exec -T backend python -) | Select-Object -Last 1
    Check 'logo lookup'
    if (-not $logo) { throw 'brand_profile has no logo_url' }
    if ($logo -match '^https?://') { $logo = ([uri]$logo).AbsolutePath }  # prod stores an absolute URL; test the local mirror
    $code = curl.exe -s -o NUL -w '%{http_code}' "http://localhost:7222$logo"
    Write-Host "    logo $logo -> $code"
    if ($code -ne '200') { throw "logo check returned $code" }
}

Write-Host 'mirror complete'
