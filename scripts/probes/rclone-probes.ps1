# rclone behaviour probes for rcloneGUI on Windows. Re-run after every rclone upgrade and
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
# F11: both sides with the same filter. Saved as tests/fixtures/lsjson-l-src.json and lsjson-l-dst.json.
# "> file" in PowerShell 5.1 writes UTF-16, so stdout goes through Start-Process (raw bytes).
foreach ($side in 'src', 'dst') {
  $p = Start-Process -FilePath $Rclone -ArgumentList @('lsjson', '-R', '--files-only', '--filter-from', 'job.filter', $side) -NoNewWindow -Wait -PassThru -RedirectStandardOutput "lsjson-l-$side.json" -RedirectStandardError "lsjson-l-$side.err"
  "[exit $($p.ExitCode)]"; Show "lsjson-l-$side.json"
}
$p = Start-Process -FilePath $Rclone -ArgumentList @('lsjson', '-R', '--files-only', 'missing-dir') -NoNewWindow -Wait -PassThru -RedirectStandardOutput 'lsjson-missing.json' -RedirectStandardError 'lsjson-missing.err'
"[exit missing $($p.ExitCode)]"; Show 'lsjson-missing.err'
& $Rclone listremotes
"[exit $LASTEXITCODE]"

# F25 scope: all / files only / folder structure only. Empty dirs: src\emptydir, dst\dst-emptydir.
function SetupScope {
  Setup
  New-Item -ItemType Directory -Force -Path (Join-Path $Work 'src\emptydir\inner') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $Work 'dst\dst-emptydir') | Out-Null
}
function Tree([string]$root) {
  Get-ChildItem -LiteralPath (Join-Path $Work $root) -Recurse | ForEach-Object {
    $kind = if ($_.PSIsContainer) { 'D' } else { 'F' }
    "$kind $($_.FullName.Substring($Work.Length + 1))"
  }
}

Hdr 'P1. sync (default, files only?) real run'
SetupScope
RunLog 'log-p1.jsonl' @('sync', 'src', 'dst', '--combined', 'combined-p1.txt', '--exclude', 'node_modules/**', '--retries', '1')
"[exit $LASTEXITCODE]"; '--- combined'; Show 'combined-p1.txt'; '--- dst'; Tree 'dst'

Hdr 'P2. sync --create-empty-src-dirs real run'
SetupScope
RunLog 'log-p2.jsonl' @('sync', 'src', 'dst', '--create-empty-src-dirs', '--combined', 'combined-p2.txt', '--exclude', 'node_modules/**', '--retries', '1')
"[exit $LASTEXITCODE]"; '--- combined'; Show 'combined-p2.txt'; '--- dst'; Tree 'dst'

Hdr 'P3. sync --create-empty-src-dirs with filter "- *" (folders only?) dry-run then real'
SetupScope
[IO.File]::WriteAllText((Join-Path $Work 'dirs.filter'), "- node_modules/**`n+ */`n- *`n")
RunLog 'log-p3d.jsonl' @('sync', 'src', 'dst', '--dry-run', '--create-empty-src-dirs', '--filter-from', 'dirs.filter', '--combined', 'combined-p3d.txt', '--use-json-log', '--retries', '1', '-v')
"[exit dry $LASTEXITCODE]"; '--- combined'; Show 'combined-p3d.txt'; '--- dst after dry-run'; Tree 'dst'
RunLog 'log-p3.jsonl' @('sync', 'src', 'dst', '--create-empty-src-dirs', '--filter-from', 'dirs.filter', '--combined', 'combined-p3.txt', '--retries', '1', '-v')
"[exit $LASTEXITCODE]"; '--- combined'; Show 'combined-p3.txt'; '--- dst'; Tree 'dst'; '--- log'; Show 'log-p3.jsonl'

Hdr 'P4. copy with filter "- *" and --create-empty-src-dirs (folders only, copy) real run'
SetupScope
RunLog 'log-p4.jsonl' @('copy', 'src', 'dst', '--create-empty-src-dirs', '--filter-from', 'dirs.filter', '--combined', 'combined-p4.txt', '--retries', '1')
"[exit $LASTEXITCODE]"; '--- combined'; Show 'combined-p4.txt'; '--- dst'; Tree 'dst'

Hdr 'P5. sync --create-empty-src-dirs real run with JSON log (directory messages)'
SetupScope
RunLog 'log-p5.jsonl' @('sync', 'src', 'dst', '--create-empty-src-dirs', '--combined', 'combined-p5.txt', '--exclude', 'node_modules/**', '--use-json-log', '-v', '--retries', '1')
"[exit $LASTEXITCODE]"; '--- log (directory lines)'; Show 'log-p5.jsonl' | Select-String -Pattern 'irector'

Hdr 'P6. dst-only folder that holds only filtered files (folders-only filter), dry-run then real --max-delete 0'
SetupScope
Mk 'dst\dstonly-withfile\x.txt' 'kept'
RunLog 'log-p6d.jsonl' @('sync', 'src', 'dst', '--dry-run', '--create-empty-src-dirs', '--filter-from', 'dirs.filter', '--combined', 'combined-p6d.txt', '--use-json-log', '-v', '--retries', '1')
"[exit dry $LASTEXITCODE]"; '--- dry-run directory lines'; Show 'log-p6d.jsonl' | Select-String -Pattern 'remove directory'
RunLog 'log-p6.jsonl' @('sync', 'src', 'dst', '--create-empty-src-dirs', '--filter-from', 'dirs.filter', '--max-delete', '0', '--combined', 'combined-p6.txt', '--use-json-log', '-v', '--retries', '1')
"[exit $LASTEXITCODE]"; '--- real run directory lines'; Show 'log-p6.jsonl' | Select-String -Pattern 'Removing directory'
'--- dst after (dstonly-withfile must remain)'; Tree 'dst' | Select-String -Pattern 'dstonly|dst-emptydir'

Hdr 'Q. about --json (F20 capacity). Saved as tests/fixtures/about-q.json'
$p = Start-Process -FilePath $Rclone -ArgumentList @('about', 'src', '--json') -NoNewWindow -Wait -PassThru -RedirectStandardOutput 'about-q.json' -RedirectStandardError 'about-q.err'
"[exit $($p.ExitCode)]"; Show 'about-q.json'
$p = Start-Process -FilePath $Rclone -ArgumentList @('about', 'missing-dir', '--json') -NoNewWindow -Wait -PassThru -RedirectStandardOutput 'about-missing.json' -RedirectStandardError 'about-missing.err'
"[exit missing $($p.ExitCode)]"; Show 'about-missing.err'

Hdr 'N. copy --dry-run --combined (are dst-only files reported as -?)'
Setup
& $Rclone copy src dst --dry-run --combined combined-n.txt --retries 1 --exclude 'node_modules/**' 2> $null
"[exit $LASTEXITCODE]"; Show 'combined-n.txt'

Hdr 'M. usage error exit code'
& $Rclone sync onlyonearg 2> $null | Out-Null
"[exit $LASTEXITCODE]"
