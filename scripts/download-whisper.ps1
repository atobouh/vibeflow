$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$binDir = Join-Path $repoRoot "assets\\whisper\\bin\\win"
$modelDir = Join-Path $repoRoot "assets\\whisper\\models"
New-Item -ItemType Directory -Force -Path $binDir, $modelDir | Out-Null

$version = "v1.8.2"
$zipUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/$version/whisper-bin-x64.zip"
$zipPath = Join-Path $env:TEMP "whisper-bin-x64.zip"
Write-Host "Downloading Whisper CLI..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

$extractDir = Join-Path $env:TEMP ("whisper-bin-" + [guid]::NewGuid().ToString())
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$exe = Get-ChildItem -Path $extractDir -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
if (-not $exe) {
  $exe = Get-ChildItem -Path $extractDir -Recurse -Filter "main.exe" | Select-Object -First 1
}
if (-not $exe) {
  throw "Unable to locate whisper-cli.exe in the archive."
}
Copy-Item -Path $exe.FullName -Destination (Join-Path $binDir "whisper-cli.exe") -Force

$dlls = Get-ChildItem -Path $exe.Directory.FullName -Filter "*.dll" -ErrorAction SilentlyContinue
foreach ($dll in $dlls) {
  Copy-Item -Path $dll.FullName -Destination (Join-Path $binDir $dll.Name) -Force
}

$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin"
$modelPath = Join-Path $modelDir "ggml-tiny.en-q5_1.bin"
Write-Host "Downloading Whisper tiny.en model..."
Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath

Write-Host "Whisper CLI installed to $binDir"
Write-Host "Whisper model downloaded to $modelDir"
