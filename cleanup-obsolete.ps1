param(
  [string]$ProjectRoot = "C:\Users\amadorg\Documents\pprog\friends-search-engine"
)

$ErrorActionPreference = "Stop"

function Remove-IfExists {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
    Write-Host "Eliminado: $Path"
  }
}

$corpus = Join-Path $ProjectRoot "public\data\friends-corpus.json"

if (-not (Test-Path -LiteralPath $corpus)) {
  throw "ABORTADO: no existe $corpus. No se limpia public\data para no perder la transcripción completa."
}

# Generados / investigación cerrada.
Remove-IfExists (Join-Path $ProjectRoot "dist")
Remove-IfExists (Join-Path $ProjectRoot "benchmark")
Remove-IfExists (Join-Path $ProjectRoot "data")
Remove-IfExists (Join-Path $ProjectRoot "scripts")

# Motor local ya reemplazado por backend.
Remove-IfExists (Join-Path $ProjectRoot "src\search\search.worker.js")

# Mantener exclusivamente el corpus necesario para "Ver capítulo completo".
$publicData = Join-Path $ProjectRoot "public\data"
if (Test-Path -LiteralPath $publicData) {
  Get-ChildItem -LiteralPath $publicData -Force | Where-Object {
    $_.FullName -ne $corpus
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
    Write-Host "Eliminado de public\data: $($_.Name)"
  }
}

# README histórico obsoleto, si todavía existe.
$legacyReadme = Join-Path $ProjectRoot "README.txt"
if (Test-Path -LiteralPath $legacyReadme) {
  Remove-Item -LiteralPath $legacyReadme -Force
  Write-Host "Eliminado: $legacyReadme"
}

Write-Host ""
Write-Host "Limpieza terminada."
Write-Host "Se preservó: $corpus"
Write-Host "No se tocó cloudflare-worker ni node_modules."
