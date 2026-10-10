$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$outputRoot = Join-Path $sourceRoot "release\preview-$($manifest.version)-$stamp"
$stageRoot = Join-Path $outputRoot 'extension'
[IO.Directory]::CreateDirectory($stageRoot) | Out-Null
$runtimeFiles = @('manifest.json','sidebar.html','app.js','background.js')
foreach ($folder in @('assets','shared','features')) {
  $runtimeFiles += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $folder) -Recurse -File | ForEach-Object { $_.FullName.Substring($sourceRoot.Length + 1) }
}
foreach ($relativePath in $runtimeFiles) {
  $destination = Join-Path $stageRoot $relativePath
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceRoot $relativePath) -Destination $destination
}
$zipPath = Join-Path $outputRoot "mewe-$($manifest.version)-preview.zip"
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $zipPath
Copy-Item -LiteralPath (Join-Path $sourceRoot 'assets\icons\icon128.png') -Destination (Join-Path $outputRoot 'store-icon128.png')
Set-Content -LiteralPath (Join-Path $outputRoot 'README.txt') -Encoding utf8 -Value @"
ME:WE packaging preview only. Not approved for submission.
Resolve docs/release-checklist.md before producing a submission candidate.
The package contains a draft privacy notice. Screenshots are not included.
Runtime files: $($runtimeFiles.Count)
SHA256: $((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)
"@
Write-Output $outputRoot
