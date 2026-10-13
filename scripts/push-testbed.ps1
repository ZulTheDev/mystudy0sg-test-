# Publish ONLY the Study0SG staging portal to ZulTheDev/mystudy0sg-test-.
# Run inside the real Git clone (with its .git directory), not a downloaded ZIP.
param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Message = 'Update Study0SG test-bed portal',
  [string]$Branch = 'main'
)
$ErrorActionPreference = 'Stop'
Set-Location $RepoPath
function RunGit([string[]]$GitArgs) {
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) { throw "Git failed: $($GitArgs -join ' ')" }
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Please install Git first.' }
if (-not (Test-Path '.git')) { throw 'Not a Git repository. Clone the staging repo and place the portal files in its root first.' }
if (-not (Test-Path 'package.json') -or -not (Test-Path 'src/App.tsx')) { throw 'Expected organizer-portal files in repository ROOT. Refusing to push the wrong app.' }
$remote = (& git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $remote -notmatch '^(?:https://github\.com/|git@github\.com:)(?i:ZulTheDev)/(?i:mystudy0sg-test-)(?:\.git)?$') {
  throw "Refusing to push to non-testbed remote: $remote"
}
$active = (& git branch --show-current).Trim()
if ($active -ne $Branch) { throw "Current branch is '$active'. Checkout '$Branch' first." }
Write-Host "Staging repository: $remote, branch $Branch" -ForegroundColor Cyan
RunGit -GitArgs @('status','--short')
RunGit -GitArgs @('add','--all')
RunGit -GitArgs @('diff','--cached','--check')
if (Get-Command node -ErrorAction SilentlyContinue) {
  & node scripts/check-staged.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Secret/path safety check failed.' }
} else { throw 'Node.js is required to run the secret safety checks.' }
$changes = (& git diff --cached --name-only)
if (-not $changes) { Write-Host 'Nothing new to commit.'; exit 0 }
Write-Host "Reviewing these staged files:" -ForegroundColor Cyan
$changes | ForEach-Object { Write-Host "  $_" }
$confirm = Read-Host 'Type PUSH TESTBED to commit and publish'
if ($confirm -cne 'PUSH TESTBED') { throw 'Cancelled. Files remain staged.' }
RunGit -GitArgs @('commit','-m',$Message)
RunGit -GitArgs @('push','origin',$Branch)
Write-Host 'Code pushed. Check Actions > Study0SG | Deploy Org Dev for live Pages status.' -ForegroundColor Green
