<#
.SYNOPSIS
  Removes the Genesys host companion for the current Windows user.

.DESCRIPTION
  Unregisters the Native Messaging host from Chrome and Edge (current user
  only), stops any tunnel it left running, and deletes its folder.
#>
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'GenesysOverlay\host')
)

$ErrorActionPreference = 'Stop'
$HostName = 'com.genesys_overlay.host'

foreach ($key in "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName", "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName") {
  if (Test-Path $key) {
    Remove-Item -Force $key
    Write-Host "-> Removed $key"
  }
}

if (Test-Path $InstallDir) {
  # Only touch a folder that is really ours.
  if (-not (Test-Path (Join-Path $InstallDir 'native-host.cjs'))) {
    throw "$InstallDir doesn't look like a Genesys host install, so it was left alone."
  }
  $cloudflared = Join-Path $InstallDir 'cloudflared.exe'
  Get-Process cloudflared -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $cloudflared } |
    Stop-Process -Force
  Remove-Item -Recurse -Force $InstallDir
  Write-Host "-> Deleted $InstallDir"
}

Write-Host 'The host companion is uninstalled.'
