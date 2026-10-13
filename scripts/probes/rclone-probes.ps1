# rclone behaviour probes for Baton on Windows. Re-run after every rclone upgrade and
# record differences in docs/knowhow/rclone-notes.md.
# ASCII only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
# Usage: powershell -File scripts/probes/rclone-probes.ps1 -Work <empty work dir>
param(
  [Parameter(Mandatory = $true)][string]$Work,
  [string]$Rclone = 'rclone'
)

$ErrorActionPreference = 'Continue'
if (Test-Path -LiteralPath $Work) { Remove-Item -LiteralPath $Work -Recurse -Force -Confirm:$false }
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location -LiteralPath $Work

function Mk([string]$rel, [string]$text) {
  $full = Join-Path $Work $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $full) | Out-Null
  [IO.File]::WriteAllText($full, $text)
}

function Setup {
  foreach ($d in 'src', 'dst', 'bak') {
    $p = Join-Path $Work $d
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force -Confirm:$false }
  }
  Mk 'src\same.txt' 'hello'; Mk 'dst\same.txt' 'hello'
  Mk 'src\sub\deep.txt' 'deep'; Mk 'dst\sub\deep.txt' 'deep'
  $t = Get-Date '2026-10-01 10:00:00'
  foreach ($f in 'src\same.txt', 'dst\same.txt', 'src\sub\deep.txt', 'dst\sub\deep.txt') {
    (Get-Item -LiteralPath (Join-Path $Work $f)).LastWriteTime = $t
  }
  Mk 'src\only-src.txt' 'new file'
  Mk 'dst\only-dst.txt' 'old file'
  Mk 'src\changed.txt' 'version 2 longer'; Mk 'dst\changed.txt' 'version 1'
  Mk 'src\node_modules\pkg\index.js' 'x'; Mk 'dst\node_modules\pkg\old.js' 'y'
  Mk ("src\$([char]0xD55C)$([char]0xAE00) dir\file with space.txt") 'k'
}

function Hdr([string]$s) { "`n===== $s =====" }
function Show([string]$file) { if (Test-Path -LiteralPath $file) { Get-Content -LiteralPath $file -Encoding UTF8 } }

# PowerShell 5.1's "2>" wraps native stderr lines into error records and breaks the JSON log,
# so stderr goes straight to a file. Arguments here must not contain spaces.
function RunLog([string]$log, [string[]]$rcArgs) {
  $p = Start-Process -FilePath $Rclone -ArgumentList $rcArgs -NoNewWindow -Wait -PassThru -RedirectStandardError $log
  $global:LASTEXITCODE = $p.ExitCode
}

Hdr 'version'
& $Rclone version

Hdr 'A. sync --dry-run --combined + JSON log'
Setup
RunLog 'log-a.jsonl' @('sync', 'src', 'dst', '--dry-run', '--combined', 'combined-a.txt', '--use-json-log', '-v', '--stats', '1s', '--retries', '1', '--exclude', 'node_modules/**')
"[exit $LASTEXITCODE]"
'--- combined'; Show 'combined-a.txt'
'--- combined first bytes'; (Format-Hex -Path combined-a.txt | Select-Object -First 2 | Out-String).Trim()
'--- log'; Show 'log-a.jsonl'
'--- dst (must be unchanged)'; Get-ChildItem dst -Recurse -File | ForEach-Object { $_.FullName.Substring($Work.Length + 1) }

Hdr 'G. --max-delete 1 with 3 deletions (real run)'
Setup
Mk 'dst\extra1.txt' '1'; Mk 'dst\extra2.txt' '2'
RunLog 'log-g.jsonl' @('sync', 'src', 'dst', '--max-delete', '1', '--combined', 'combined-g.txt', '--use-json-log', '-v', '--stats', '1s', '--retries', '1', '--exclude', 'node_modules/**')
"[exit $LASTEXITCODE]"
'--- combined'; Show 'combined-g.txt'
'--- log'; Show 'log-g.jsonl'
'--- dst'; Get-ChildItem dst -File | ForEach-Object { $_.Name }

Hdr 'H. --backup-dir outside dst (real run)'
Setup
RunLog 'log-h.jsonl' @('sync', 'src', 'dst', '--backup-dir', 'bak', '--combined', 'combined-h.txt', '--use-json-log', '-v', '--stats', '1s', '--retries', '1', '--exclude', 'node_modules/**')
"[exit $LASTEXITCODE]"
'--- combined'; Show 'combined-h.txt'
'--- log'; Show 'log-h.jsonl'
'--- bak'; Get-ChildItem bak -Recurse -File | ForEach-Object { $_.FullName.Substring($Work.Length + 1) }

Hdr 'H2. preview again after run (only = expected)'
& $Rclone sync src dst --dry-run --combined combined-h2.txt --use-json-log -v --retries 1 --exclude 'node_modules/**' 2> $null
"[exit $LASTEXITCODE]"; Show 'combined-h2.txt'

Hdr 'I. --backup-dir inside dst'
Setup
RunLog 'log-i.jsonl' @('sync', 'src', 'dst', '--backup-dir', 'dst\.bak', '--use-json-log', '--retries', '1')
"[exit $LASTEXITCODE]"; Show 'log-i.jsonl' | Select-Object -Last 2

Hdr 'J. source does not exist'
Setup
RunLog 'log-j.jsonl' @('sync', 'no-such-dir', 'dst', '--dry-run', '--combined', 'combined-j.txt', '--use-json-log', '--retries', '1')
"[exit $LASTEXITCODE]"; Show 'log-j.jsonl' | Select-Object -Last 2

Hdr 'K. empty source preview'
Setup
Remove-Item -LiteralPath (Join-Path $Work 'src') -Recurse -Force -Confirm:$false
New-Item -ItemType Directory -Path (Join-Path $Work 'src') | Out-Null
& $Rclone sync src dst --dry-run --combined combined-k.txt --use-json-log -v --retries 1 --exclude 'node_modules/**' 2> $null
"[exit $LASTEXITCODE]"; Show 'combined-k.txt'

Hdr 'L. --filter-from + lsjson + listremotes'
Setup
[IO.File]::WriteAllText((Join-Path $Work 'job.filter'), "- node_modules/**`n- *.sock`n")
& $Rclone sync src dst --dry-run --filter-from job.filter --combined combined-l.txt --retries 1 2> $null
"[exit $LASTEXITCODE]"; Show 'combined-l.txt'
& $Rclone lsjson -R --files-only --filter-from job.filter src
"[exit $LASTEXITCODE]"
& $Rclone listremotes
"[exit $LASTEXITCODE]"

Hdr 'N. copy --dry-run --combined (are dst-only files reported as -?)'
Setup
& $Rclone copy src dst --dry-run --combined combined-n.txt --retries 1 --exclude 'node_modules/**' 2> $null
"[exit $LASTEXITCODE]"; Show 'combined-n.txt'

Hdr 'M. usage error exit code'
& $Rclone sync onlyonearg 2> $null | Out-Null
"[exit $LASTEXITCODE]"
