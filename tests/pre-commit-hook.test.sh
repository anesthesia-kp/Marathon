#!/bin/sh
# Tests the docs-sync guard (.githooks/pre-commit) in a throwaway clone of
# this repo, so the real repo is never touched.
# Run from the tests/ folder:  sh pre-commit-hook.test.sh
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git clone -q "$REPO" "$WORK/repo" || exit 1
cd "$WORK/repo" || exit 1
git config user.name test
git config user.email test@example.com
cp "$REPO/.githooks/pre-commit" .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

pass=0
fail=0
check() { # check "<description>" <expected: PASS|BLOCKED> <commit message>
  if git commit -q -m "$3" >/dev/null 2>&1; then got=PASS; else got=BLOCKED; fi
  if [ "$got" = "$2" ]; then pass=$((pass + 1)); echo "  ok   - $1"; else fail=$((fail + 1)); echo "  FAIL - $1 (expected $2, got $got)"; fi
}
set_fp() { # put the given fingerprint on the handoff's fingerprint line
  sed -i.bak "s/index.html fingerprint: \`[0-9a-f]*\`/index.html fingerprint: \`$1\`/" MARATHON_APP_HANDOFF.md && rm -f MARATHON_APP_HANDOFF.md.bak
}

echo "pre-commit hook:"
echo "x" >> DECISIONS.md; git add DECISIONS.md
check "a commit that doesn't touch index.html goes through" PASS docs-only

echo "<!-- change 1 -->" >> index.html; git add index.html
check "index.html changed, handoff untouched -> blocked" BLOCKED no-handoff

set_fp 0000000000000000000000000000000000000000; git add MARATHON_APP_HANDOFF.md
check "index.html changed, wrong fingerprint -> blocked" BLOCKED wrong-fp

set_fp "$(git rev-parse :index.html)"; git add MARATHON_APP_HANDOFF.md
check "index.html changed, matching fingerprint -> allowed" PASS matching-fp

echo "<!-- staged -->" >> index.html; git add index.html
echo "<!-- not staged -->" >> index.html
set_fp "$(git hash-object index.html)"; git add MARATHON_APP_HANDOFF.md
check "fingerprint matches the unstaged file, not what's being committed -> blocked" BLOCKED unstaged-fp

git checkout -q -- index.html
set_fp "$(git rev-parse :index.html)"; git add MARATHON_APP_HANDOFF.md
check "fingerprint matches what's being committed -> allowed" PASS staged-fp

git rm -q index.html
check "index.html deleted -> blocked" BLOCKED deleted

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
