param(
    [string]$Message = "checkpoint: save progress",
    [string]$Tag = ""
)

git add -A

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No staged changes to commit."
    exit 0
}

git commit -m $Message

if ($Tag -ne "") {
    git tag $Tag
    Write-Host "Created tag: $Tag"
}

git log -1 --oneline