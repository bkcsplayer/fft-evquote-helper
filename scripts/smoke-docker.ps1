param(
  [string]$ApiBase = "http://localhost:7222/api/v1",
  [string]$FrontendBase = "http://localhost:7220",
  [string]$AdminBase = "http://localhost:7221",
  [string]$AdminUsername = "admin",
  [string]$AdminPassword = "admin1234"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "`n== $msg ==" -ForegroundColor Cyan
}

function Invoke-Json($Method, $Url, $Body = $null, $Headers = $null) {
  $opts = @{
    Method      = $Method
    Uri         = $Url
    Headers     = $Headers
    ContentType = "application/json"
  }
  if ($null -ne $Body) {
    $opts.Body = ($Body | ConvertTo-Json -Depth 10)
  }
  return Invoke-RestMethod @opts
}

function Assert-StatusCode($Url, $Expected = 200) {
  $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method GET
  if ($res.StatusCode -ne $Expected) { throw "Expected $Expected for $Url, got $($res.StatusCode)" }
  return $res
}

function Wait-HttpOk($Url, $TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastErr = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method GET -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $r }
    } catch {
      $lastErr = $_
    }
    Start-Sleep -Seconds 2
  }
  if ($lastErr) { throw $lastErr }
  throw "Timeout waiting for $Url"
}

Write-Step "Health check"
$healthUrl = "$($ApiBase.Replace('/api/v1',''))/health"
$healthRes = Wait-HttpOk $healthUrl 90
if ($healthRes.StatusCode -ne 200) { throw "Health check failed: $healthUrl" }
if (-not $healthRes.Headers["x-request-id"]) { throw "Missing x-request-id header on health endpoint" }

Write-Step "UI endpoints reachable"
Wait-HttpOk "$FrontendBase/quote" 90 | Out-Null
Wait-HttpOk "$AdminBase/admin" 90 | Out-Null
Wait-HttpOk "$($ApiBase.Replace('/api/v1',''))/docs" 90 | Out-Null

Write-Step "Submit case"
$casePayload = @{
  customer = @{
    nickname = "SmokeTest"
    phone    = "+14035550123"
    email    = "smoke@example.com"
  }
  charger_brand           = "Tesla Wall Connector"
  ev_brand                = "Tesla"
  install_address         = "123 4 Ave SW, Calgary, AB, Canada"
  pickup_date             = $null
  preferred_install_date  = $null
  referrer                = "smoke"
  preferred_survey_slots  = @{ slots = @("morning","afternoon") }
  notes                   = "docker smoke test"
}
$submitted = Invoke-Json "POST" "$ApiBase/cases" $casePayload
$token = $submitted.access_token
$ref = $submitted.reference_number
Write-Host "Created case: $ref (token=$token)"

Write-Step "Admin login"
$login = Invoke-Json "POST" "$ApiBase/admin/auth/login" @{ username = $AdminUsername; password = $AdminPassword }
$adminToken = $login.access_token
$authHeaders = @{ Authorization = "Bearer $adminToken" }

Write-Step "Find case_id by reference"
$cases = Invoke-RestMethod -Method GET -Uri "$ApiBase/admin/cases?q=$ref" -Headers $authHeaders
if (-not $cases -or -not $cases[0].id) { throw "Could not find case by reference: $ref" }
$caseId = $cases[0].id
Write-Host "case_id: $caseId"

Write-Step "Schedule survey"
$surveyDt = (Get-Date).ToUniversalTime().AddDays(2)
Invoke-Json "POST" "$ApiBase/admin/cases/$caseId/survey/schedule" @{ scheduled_date = $surveyDt.ToString("o") } $authHeaders | Out-Null

Write-Step "Fetch e-transfer info"
$et = Invoke-RestMethod -Method GET -Uri "$ApiBase/payments/etransfer-info/$token"
Write-Host ("e-transfer amount={0} reference={1}" -f $et.amount, $et.reference_number)

Write-Step "Customer reports e-transfer sent"
Invoke-Json "POST" "$ApiBase/payments/etransfer-notify" @{ token = $token; sender_name = "SmokeTest"; note = "sent via Interac" } | Out-Null

Write-Step "Admin marks deposit paid"
Invoke-Json "PATCH" "$ApiBase/admin/cases/$caseId/survey/deposit-paid" @{ note = "Deposit marked paid (smoke)" } $authHeaders | Out-Null

Write-Step "Complete survey"
Invoke-Json "PATCH" "$ApiBase/admin/cases/$caseId/survey/complete" @{ survey_notes = "ok" } $authHeaders | Out-Null

Write-Step "Create quote"
$quoteIn = @{
  install_type           = "surface_mount"
  base_price             = 699
  extra_distance_meters  = 0
  extra_distance_rate    = 30
  permit_fee             = 349
  survey_credit          = 99
  gst_rate               = 5
  customer_notes         = "Thank you"
  admin_notes            = "smoke"
  addons                 = @(
    @{ name = "NEMA 14-50 upgrade"; price = 149; description = "" }
  )
}
$quote = Invoke-Json "POST" "$ApiBase/admin/cases/$caseId/quotes" $quoteIn $authHeaders
$quoteId = $quote.id
Write-Host "quote_id: $quoteId"

Write-Step "Send quote"
Invoke-Json "POST" "$ApiBase/admin/quotes/$quoteId/send" $null $authHeaders | Out-Null

Write-Step "Customer approves quote (signature)"
# 1x1 transparent PNG
$sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8O0kAAAAASUVORK5CYII="
$approved = Invoke-Json "POST" "$ApiBase/quotes/approve/$token" @{ agreed = $true; signed_name = "Smoke Test"; signature_data = $sig }
if (-not $approved.signature) { throw "Quote approval failed: signature missing" }

Write-Step "Create permit (applied)"
$permitApplied = @{
  permit_number          = "P-$ref"
  applied_date           = (Get-Date).ToString("yyyy-MM-dd")
  expected_approval_date = $null
  actual_approval_date   = $null
  status                 = "applied"
  notes                  = "submitted"
}
Invoke-Json "POST" "$ApiBase/admin/cases/$caseId/permit" $permitApplied $authHeaders | Out-Null

Write-Step "Approve permit"
$permitApproved = $permitApplied.Clone()
$permitApproved.status = "approved"
$permitApproved.actual_approval_date = (Get-Date).ToString("yyyy-MM-dd")
Invoke-Json "POST" "$ApiBase/admin/cases/$caseId/permit" $permitApproved $authHeaders | Out-Null

Write-Step "Schedule installation"
$installDt = (Get-Date).ToUniversalTime().AddDays(10)
Invoke-Json "POST" "$ApiBase/admin/cases/$caseId/installation/schedule" @{ scheduled_date = $installDt.ToString("o"); notes = "bring ladder" } $authHeaders | Out-Null

Write-Step "Complete installation"
Invoke-Json "PATCH" "$ApiBase/admin/cases/$caseId/installation/complete" @{ notes = "done" } $authHeaders | Out-Null

Write-Step "Send completion email (moves case to completed)"
Invoke-Json "POST" "$ApiBase/admin/cases/$caseId/completion-email" $null $authHeaders | Out-Null

Write-Step "Verify final status"
$status = Invoke-RestMethod -Method GET -Uri "$ApiBase/cases/status/$token"
Write-Host ("Final status: {0}" -f $status.status)
if ($status.status -ne "completed") { throw "Expected completed, got: $($status.status)" }

Write-Host "`nSmoke test OK." -ForegroundColor Green

