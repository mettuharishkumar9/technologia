#requires -Version 5.1
<#
.SYNOPSIS
  Headless invocation of /databricks-pulse via claude -p, with logging.
  Designed to be invoked by Windows Task Scheduler at 08:32 and 20:32 IST.

.DESCRIPTION
  Pre-allows the tools the skill needs (WebFetch, Bash, Read, Write, Edit),
  adds the skill folder + Social_Media_Project to the allowed directories,
  caps the token budget so a runaway prompt can't overspend, and tees
  output into ~/.claude/skills/databricks-pulse/logs/scan-YYYY-MM-DD.log.
#>

$ErrorActionPreference = "Continue"
$skillRoot = Join-Path $env:USERPROFILE ".claude\skills\databricks-pulse"
$logDir    = Join-Path $skillRoot "logs"
$claudeExe = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
$socialMediaDir = Join-Path $env:USERPROFILE "Social_Media_Project"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$today    = (Get-Date).ToString("yyyy-MM-dd")
$logFile  = Join-Path $logDir "scan-$today.log"
$startTs  = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")

"" | Add-Content $logFile
"=== Scheduled scan starting === $startTs" | Add-Content $logFile
"  Invoker: $($MyInvocation.MyCommand.Path)" | Add-Content $logFile
"  Claude:  $claudeExe" | Add-Content $logFile

if (-not (Test-Path $claudeExe)) {
  "ERROR: claude.exe not found at $claudeExe" | Add-Content $logFile
  exit 1
}

# Run claude -p with the skill prompt. Flags:
#   --print                 non-interactive
#   --allowedTools          pre-approve tools (no permission prompt = no hang)
#   --add-dir               grant tool access to skill + Social_Media_Project
#   --max-budget-usd 0.50   cap spend in case of a runaway loop
$args = @(
  "--print",
  "--allowedTools", "WebFetch", "Bash", "Read", "Write", "Edit",
  "--add-dir", $skillRoot, $socialMediaDir,
  "--max-budget-usd", "0.50",
  "/databricks-pulse"
)

try {
  & $claudeExe @args 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  $exit = $LASTEXITCODE
  $endTs = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
  "=== Scheduled scan finished === $endTs (exit=$exit)" | Add-Content $logFile
  exit $exit
} catch {
  "ERROR during claude invocation: $($_.Exception.Message)" | Add-Content $logFile
  exit 1
}
