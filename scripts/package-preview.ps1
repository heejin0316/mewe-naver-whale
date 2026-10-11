$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$outputRoot = Join-Path $sourceRoot "release\preview-$($manifest.version)-$stamp"
$stageRoot = Join-Path $outputRoot 'extension'
[IO.Directory]::CreateDirectory($stageRoot) | Out-Null
$runtimeFiles = @('manifest.json','sidebar.html','app.js','background.js','LICENSE')
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
ME:WE 포장 확인본 — 스토어 제출 완료본이 아닙니다.
제출 전 docs/release-checklist.md의 미완료 항목을 확인하세요.
개인정보 처리방침 검토본이 포함되어 있습니다. 스토어 스크린샷은 별도 준비합니다.
코드: MIT / 로고: assets/icons/LICENSE.txt의 별도 정책 적용
포함 파일 수: $($runtimeFiles.Count)
SHA256: $((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)
"@
Write-Output $outputRoot
