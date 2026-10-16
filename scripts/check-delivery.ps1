$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deliveryRoot = Join-Path $sourceRoot 'delivery'
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$zipPath = Join-Path $deliveryRoot "MEWE-$($manifest.version).zip"

# Compare the archive directly with runtime sources, including the exact file set.
$expected = @{}
foreach ($name in @('manifest.json', 'sidebar.html', 'app.js', 'background.js', 'LICENSE')) {
  $expected[$name] = Join-Path $sourceRoot $name
}
foreach ($folder in @('assets', 'shared', 'features')) {
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceRoot $folder) -Recurse -File) {
    $relative = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
    $expected[$relative] = $file.FullName
  }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
$seen = @{}
try {
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    if ($name.EndsWith('/')) { continue }
    if (!$expected.ContainsKey($name) -or $seen.ContainsKey($name)) { throw "Unexpected or duplicate ZIP entry: $name" }
    $stream = $entry.Open()
    try { $actualHash = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash }
    finally { $stream.Dispose() }
    if ($actualHash -ne (Get-FileHash -LiteralPath $expected[$name] -Algorithm SHA256).Hash) { throw "ZIP/source mismatch: $name" }
    $seen[$name] = $true
  }
  if ($seen.Count -ne $expected.Count) { throw "ZIP file count mismatch: $($seen.Count) / $($expected.Count)" }
} finally { $archive.Dispose() }

function Assert-PngSize([string] $path, [int] $width, [int] $height) {
  $bytes = [IO.File]::ReadAllBytes($path)
  if ($bytes.Length -lt 24 -or [BitConverter]::ToString($bytes, 0, 8) -ne '89-50-4E-47-0D-0A-1A-0A') { throw "Invalid PNG: $path" }
  $w = $bytes[16] * 16777216L + $bytes[17] * 65536L + $bytes[18] * 256L + $bytes[19]
  $h = $bytes[20] * 16777216L + $bytes[21] * 65536L + $bytes[22] * 256L + $bytes[23]
  if ($w -ne $width -or $h -ne $height) { throw "PNG size mismatch: $path ($w x $h)" }
}
Assert-PngSize (Join-Path $deliveryRoot 'store-icon128.png') 128 128
foreach ($name in @('01-workspaces.png', '02-sharing.png')) {
  Assert-PngSize (Join-Path $deliveryRoot "screenshots/$name") 1280 800
}
if ((Get-FileHash -LiteralPath (Join-Path $deliveryRoot 'store-icon128.png')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $sourceRoot 'assets/icons/icon128.png')).Hash) { throw 'Store icon differs from app icon' }

$hashes = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $deliveryRoot 'SHA256SUMS.txt') -Encoding UTF8) {
  if ($line -notmatch '^([A-Fa-f0-9]{64})  (.+)$') { throw "Invalid checksum line" }
  $hashes[$Matches[2]] = $Matches[1]
}
$files = @(Get-ChildItem -LiteralPath $deliveryRoot -Recurse -File | Where-Object Name -ne 'SHA256SUMS.txt')
if ($files.Count -ne $hashes.Count) { throw 'Delivery checksum file count mismatch' }
foreach ($file in $files) {
  $relative = $file.FullName.Substring($deliveryRoot.Length + 1).Replace('\', '/')
  if ($hashes[$relative] -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { throw "Delivery checksum mismatch: $relative" }
}
Write-Output "PASS: $($manifest.version), $($seen.Count) runtime files, exact ZIP/source match, 128px icon, two 1280x800 screenshots, delivery checksums."
