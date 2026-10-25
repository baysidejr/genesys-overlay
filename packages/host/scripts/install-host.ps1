<#
.SYNOPSIS
  Installs the Genesys host companion for the current Windows user, so the
  GM can click "Host a game" in the browser extension.

.DESCRIPTION
  - Copies the host to %LOCALAPPDATA%\GenesysOverlay\host.
  - Downloads cloudflared 2026.10.0 from Cloudflare's GitHub releases and
    refuses to use it unless its SHA-256 and Cloudflare code signature match.
  - Registers the Native Messaging host for Chrome and Edge under
    HKEY_CURRENT_USER only. No administrator rights, nothing machine-wide.
  - Only the Genesys Overlay extension may start the host: the developer
    build (ID fixed by the key in manifest.json) and the Chrome Web Store
    build (ID assigned by the store, set in $StoreExtensionId below).

  Needs Node.js 20 or newer on the PATH.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-host.ps1
.EXAMPLE
  install-host.ps1 -ExtensionId abcdefghijklmnopabcdefghijklmnop -Browser Chrome
  (Allows that ID as well, for example an Edge Add-ons install.)
#>
param(
  # Extension IDs allowed to start the host, besides the store build below.
  # The default matches the key in the extension's manifest.json.
  [ValidatePattern('^[a-p]{32}$')]
  [string[]]$ExtensionId = @('oompfooljghcchjdigpjicjdlncaaoki'),
  [ValidateSet('Chrome', 'Edge', 'Both')]
  [string]$Browser = 'Both',
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'GenesysOverlay\host'),
  # Copy files and fetch cloudflared, but don't touch the registry (for testing).
  [switch]$NoRegister
)

$ErrorActionPreference = 'Stop'
$HostName = 'com.genesys_overlay.host'

# The Chrome Web Store build's ID. The store shows it once the item is
# created; fill it in then, so GMs who install from the store can host too.
$StoreExtensionId = ''
$AllowedIds = @(@($ExtensionId) + @($StoreExtensionId) | Where-Object { $_ } | Select-Object -Unique)

# Pinned cloudflared release. Update all three together.
$CloudflaredVersion = '2026.10.0'
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/download/$CloudflaredVersion/cloudflared-windows-amd64.exe"
$CloudflaredSha256 = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'

function Step($text) { Write-Host "-> $text" }

# 1. Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js was not found. Install Node.js 20 or newer from https://nodejs.org, then run this again.' }
# Single quotes inside: Windows PowerShell 5.1 drops embedded double quotes on native arguments.
$nodeMajor = [int](& $node.Source -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { throw "Node.js $nodeMajor is too old. Install Node.js 20 or newer from https://nodejs.org." }
Step "Using Node.js $(& $node.Source -v) at $($node.Source)"

# 2. Host files: next to this script in a release folder, or in ..\dist in the repository.
$source = @($PSScriptRoot, (Join-Path $PSScriptRoot '..\dist')) |
  Where-Object { Test-Path (Join-Path $_ 'native-host.cjs') } | Select-Object -First 1
if (-not $source) { throw 'native-host.cjs not found. In the repository, run "pnpm --filter @genesys/host build" first.' }
New-Item -ItemType Directory -Force $InstallDir | Out-Null
foreach ($file in 'native-host.cjs', 'cli.cjs') {
  Copy-Item -Force (Join-Path $source $file) (Join-Path $InstallDir $file)
}
Step "Copied the host to $InstallDir"

# 3. cloudflared, verified before it's ever run.
$cloudflared = Join-Path $InstallDir 'cloudflared.exe'
function Test-Cloudflared($path) {
  if (-not (Test-Path $path)) { return $false }
  if ((Get-FileHash $path -Algorithm SHA256).Hash.ToLower() -ne $CloudflaredSha256) { return $false }
  $sig = Get-AuthenticodeSignature $path
  return ($sig.Status -eq 'Valid' -and $sig.SignerCertificate.Subject -like '*O="Cloudflare, Inc."*')
}
if (Test-Cloudflared $cloudflared) {
  Step "cloudflared $CloudflaredVersion is already installed and verified"
} else {
  Step "Downloading cloudflared $CloudflaredVersion from GitHub"
  $download = "$cloudflared.download"
  Invoke-WebRequest -Uri $CloudflaredUrl -OutFile $download -UseBasicParsing
  if (-not (Test-Cloudflared $download)) {
    Remove-Item -Force $download
    throw 'The downloaded cloudflared did not match the expected checksum and Cloudflare signature, so it was deleted. Nothing was installed.'
  }
  Move-Item -Force $download $cloudflared
  Step 'cloudflared verified (SHA-256 and Cloudflare signature)'
}

# 4. Launcher Chrome starts, and the Native Messaging manifest.
$launcher = Join-Path $InstallDir 'genesys-host.cmd'
Set-Content -Encoding ASCII -Path $launcher -Value @(
  '@echo off',
  "`"$($node.Source)`" `"%~dp0native-host.cjs`" %*"
)
$manifestPath = Join-Path $InstallDir "$HostName.json"
$manifest = [ordered]@{
  name            = $HostName
  description     = 'Genesys Overlay host companion'
  path            = $launcher
  type            = 'stdio'
  allowed_origins = @($AllowedIds | ForEach-Object { "chrome-extension://$_/" })
}
# UTF-8 without a byte-order mark: Windows PowerShell's -Encoding UTF8 adds one, which JSON readers may reject.
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
Step "Wrote $manifestPath (allows only extension $($AllowedIds -join ', '))"

# 5. Per-user registration.
if ($NoRegister) {
  Step 'Skipped browser registration (-NoRegister)'
} else {
  $keys = @()
  if ($Browser -in 'Chrome', 'Both') { $keys += "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" }
  if ($Browser -in 'Edge', 'Both') { $keys += "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" }
  foreach ($key in $keys) {
    New-Item -Force -Path $key | Out-Null
    Set-Item -Path $key -Value $manifestPath
    Step "Registered $key"
  }
}

Write-Host ''
Write-Host 'Done. Restart the browser, open your tabletop, and choose "Host a game" in the dice tray.'
