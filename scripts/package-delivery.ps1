$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content (Join-Path $sourceRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$outputRoot = Join-Path $sourceRoot 'delivery'
[IO.Directory]::CreateDirectory($outputRoot) | Out-Null
foreach ($name in @('01-workspaces.png','02-sharing.png')) {
  $imagePath = Join-Path $outputRoot "screenshots\$name"
  if (!(Test-Path -LiteralPath $imagePath)) { throw "Run scripts/capture-store.cjs first: $name" }
}
$previewRoot = & (Join-Path $PSScriptRoot 'package-preview.ps1')
$appZip = Join-Path $outputRoot "MEWE-$($manifest.version).zip"
Copy-Item -LiteralPath (Join-Path $previewRoot "mewe-$($manifest.version)-preview.zip") -Destination $appZip
Copy-Item -LiteralPath (Join-Path $sourceRoot 'assets\icons\icon128.png') -Destination (Join-Path $outputRoot 'store-icon128.png')
# Verify the actual archive, not just the pre-compression staging directory.
$verifiedRoot = Join-Path $previewRoot 'verified'
Expand-Archive -LiteralPath $appZip -DestinationPath $verifiedRoot
$stagedRoot = Join-Path $previewRoot 'extension'
$stagedFiles = @(Get-ChildItem $stagedRoot -Recurse -File)
if (@(Get-ChildItem $verifiedRoot -Recurse -File).Count -ne $stagedFiles.Count) { throw 'Archive file count mismatch' }
foreach ($file in $stagedFiles) {
  $relative = $file.FullName.Substring($stagedRoot.Length + 1)
  $extracted = Join-Path $verifiedRoot $relative
  if (!(Test-Path -LiteralPath $extracted) -or (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $extracted).Hash) { throw "Archive mismatch: $relative" }
}
$description = Get-Content (Join-Path $sourceRoot 'docs\store-description.md') -Raw -Encoding UTF8
$plainText = [regex]::Match($description, '(?s)```text\r?\n(.*?)\r?\n```').Groups[1].Value
if (!$plainText) { throw 'Store description missing' }
[IO.File]::WriteAllText((Join-Path $outputRoot 'store-description.txt'), ($plainText.Replace("`r`n", "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$hashes = Get-ChildItem $outputRoot -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object FullName | ForEach-Object {
  $relative = $_.FullName.Substring($outputRoot.Length + 1).Replace('\','/')
  "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)  $relative"
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'SHA256SUMS.txt'), (($hashes -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$bundlePath = Join-Path $previewRoot "MEWE-$($manifest.version)-team-kit.zip"
Compress-Archive -LiteralPath $outputRoot -DestinationPath $bundlePath
Write-Output "App ZIP: $appZip"
Write-Output "Team kit: $bundlePath"
Write-Output "Verified runtime files: $($stagedFiles.Count)"
Write-Output "App SHA256: $((Get-FileHash -LiteralPath $appZip).Hash)"
