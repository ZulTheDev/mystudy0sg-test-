#!/usr/bin/env bash
# Publish ONLY the Study0SG staging app from a real Git clone.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo 'Git is required'; exit 1; }
command -v node >/dev/null || { echo 'Node.js is required for safety checks'; exit 1; }
[[ -d .git && -f src/App.tsx && -f package.json ]] || { echo 'Expected organizer-portal repo root'; exit 1; }
remote="$(git remote get-url origin)"
if [[ ! "$remote" =~ ^(https://github\.com/|git@github\.com:)[Zz]ul[Tt]he[Dd]ev/mystudy0sg-test-(\.git)?$ ]]; then
  echo "Refusing to push an unexpected repository: $remote"; exit 1
fi
branch="${1:-main}"
[[ "$(git branch --show-current)" == "$branch" ]] || { echo "Checkout $branch first"; exit 1; }
git status --short
git add -A
git diff --cached --check
node scripts/check-staged.mjs
if git diff --cached --quiet; then echo 'No changes to commit'; exit 0; fi
git diff --cached --stat
read -r -p 'Type PUSH TESTBED to commit and publish: ' answer
[[ "$answer" == 'PUSH TESTBED' ]] || { echo 'Cancelled; files remain staged'; exit 1; }
git commit -m "${2:-Update Study0SG test-bed portal}"
git push origin "$branch"
echo 'Pushed to staging. Check GitHub Actions for the Pages deployment.'
