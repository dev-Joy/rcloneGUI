#!/usr/bin/env bash
# rclone behaviour probes for the Baton development plan.
# Usage: rclone_probes.sh <empty work dir>
set -u
WORK="$1"
rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK" || exit 1

T='2026-10-01 10:00:00'
mk() { mkdir -p "$(dirname "$1")"; printf '%s' "$2" > "$1"; }

setup() {
  rm -rf src dst bak
  mkdir -p src dst
  mk src/same.txt "hello";            mk dst/same.txt "hello"
  mk src/sub/deep.txt "deep";         mk dst/sub/deep.txt "deep"
  touch -d "$T" src/same.txt dst/same.txt src/sub/deep.txt dst/sub/deep.txt
  mk src/only-src.txt "new file"
  mk dst/only-dst.txt "old file"
  mk src/changed.txt "version 2 longer"; mk dst/changed.txt "version 1"
  mk src/node_modules/pkg/index.js "x"; mk dst/node_modules/pkg/old.js "y"
  ln -s same.txt src/link-to-same
}

hdr() { printf '\n===== %s =====\n' "$1"; }
run() { "$@"; echo "[exit $?]"; }

hdr "A. sync --dry-run (text log, -v)"
setup
run rclone sync src dst --dry-run -v --exclude "node_modules/**" 2>&1

hdr "B. check --combined - (same symbols as sync logger flags)"
setup
run rclone check src dst --combined - --exclude "node_modules/**" 2>/dev/null

hdr "C. sync --dry-run --use-json-log -v --stats 1s (stderr lines)"
setup
run rclone sync src dst --dry-run -v --use-json-log --stats 1s --exclude "node_modules/**" 2>&1 | head -12

hdr "D1. real sync with an unreadable source FILE (I/O error), no --ignore-errors"
setup
mk src/locked.txt "secret"; chmod 000 src/locked.txt
chown -R rtest:rtest "$WORK"
run runuser -u rtest -- rclone sync src dst --exclude "node_modules/**" 2>&1 | grep -vE 'Transferred|Checks|Elapsed|Deleted:|^$|Errors:'
echo "dst now:"; ls dst

hdr "D2. same, with --ignore-errors"
setup
mk src/locked.txt "secret"; chmod 000 src/locked.txt
chown -R rtest:rtest "$WORK"
run runuser -u rtest -- rclone sync src dst --ignore-errors --exclude "node_modules/**" 2>&1 | grep -vE 'Transferred|Checks|Elapsed|Deleted:|^$|Errors:'
echo "dst now:"; ls dst

hdr "E. unreadable source DIRECTORY + --ignore-errors: are dst files under it deleted?"
setup
mkdir -p src/private; mk src/private/a.txt "a"; mk dst/private/a.txt "a"; mk dst/private/b.txt "b"
chmod 000 src/private
chown -R rtest:rtest "$WORK"; chmod 000 "$WORK/src/private"
run runuser -u rtest -- rclone sync src dst --ignore-errors --exclude "node_modules/**" 2>&1 | grep -vE 'Transferred|Checks|Elapsed|Deleted:|^$|Errors:'
echo "dst/private now:"; ls dst/private
chmod 755 src/private

hdr "F. unix socket in source (like .codegraph/daemon.sock), real sync"
setup
python3 -c "import socket; s=socket.socket(socket.AF_UNIX); s.bind('src/daemon.sock')"
run rclone sync src dst --exclude "node_modules/**" 2>&1 | grep -vE 'Transferred|Checks|Elapsed|Deleted:|^$|Errors:'
echo "dst now:"; ls dst

hdr "G. --max-delete 2 with 3 deletions, real sync"
setup
mk dst/extra1.txt "1"; mk dst/extra2.txt "2"
run rclone sync src dst --max-delete 2 --exclude "node_modules/**" 2>&1 | grep -vE 'Transferred|Checks|Elapsed|^$'
echo "dst now:"; ls dst

hdr "H. --backup-dir outside dst, real sync"
setup
run rclone sync src dst --backup-dir bak --exclude "node_modules/**" 2>&1 | grep -vE 'Transferred|Checks|Elapsed|^$|Deleted:|Errors:'
echo "dst:"; ls dst; echo "bak:"; find bak -type f | sort; echo "bak/changed.txt = $(cat bak/changed.txt)"

hdr "I. --backup-dir inside dst without a filter"
setup
run rclone sync src dst --backup-dir dst/.bak 2>&1 | tail -2

hdr "J. source does not exist"
setup
run rclone sync ./no-such-dir dst 2>&1 | tail -2

hdr "K. empty source dir, --dry-run: everything in dst would be deleted"
setup
rm -rf src; mkdir src
run rclone sync src dst --dry-run --exclude "node_modules/**" 2>&1 | grep -E 'delete|Deleted|NOTICE' | head -8

hdr "L. --config with alias remotes + --filter-from + lsjson"
setup
cat > baton-test.conf <<'EOF'
[proj-src]
type = alias
remote = ./src

[proj-dst]
type = alias
remote = ./dst
EOF
printf -- '- node_modules/**\n- *.sock\n+ **\n' > job.filter
run rclone --config baton-test.conf listremotes
run rclone --config baton-test.conf check proj-src: proj-dst: --filter-from job.filter --combined - 2>/dev/null
run rclone --config baton-test.conf lsjson -R --files-only --filter-from job.filter proj-src: 2>&1 | head -6

hdr "M. usage error exit code"
run rclone sync onlyonearg 2>&1 | tail -1
