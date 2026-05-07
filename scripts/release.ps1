#!/usr/bin/env pwsh
#Requires -Version 7.0
<#
.SYNOPSIS
    Prepare and cut a FlightDeck release.
.DESCRIPTION
    Automates the release process:
    1. Reads current version from package.json
    2. Bumps the specified semver component (major, minor, or patch)
    3. Validates CHANGELOG.md has unreleased entries
    4. Stamps [Unreleased] in CHANGELOG.md with version and date
    5. Updates version in package.json and src/manifest.json
    6. Runs lint, unit tests, and package build
    7. Commits, tags, and (optionally) pushes

    The release workflow (.github/workflows/release.yml) then:
    - Builds and packages dist/flightdeck.zip
    - Creates a GitHub Release with changelog notes
    - Publishes to Chrome Web Store and Edge Add-ons (when secrets are configured)
.PARAMETER Bump
    Which semver component to bump: major, minor, or patch.
.PARAMETER Push
    Push the commit and tag to origin after creating them.
.PARAMETER DryRun
    Show what would happen without making changes.
.EXAMPLE
    ./scripts/release.ps1 patch
    ./scripts/release.ps1 minor -Push
    ./scripts/release.ps1 major -DryRun
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet("major", "minor", "patch")]
    [string]$Bump,

    [switch]$Push,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Bump-Semver {
    param(
        [Parameter(Mandatory)]
        [string]$Version,
        [Parameter(Mandatory)]
        [ValidateSet("major", "minor", "patch")]
        [string]$Part
    )

    $parts = $Version.Split(".")
    if ($parts.Count -ne 3) {
        throw "Invalid semver version: $Version"
    }

    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    switch ($Part) {
        "major" { $major++; $minor = 0; $patch = 0 }
        "minor" { $minor++; $patch = 0 }
        "patch" { $patch++ }
    }

    return "$major.$minor.$patch"
}

$RepoRoot = git rev-parse --show-toplevel 2>$null
if (-not $RepoRoot) { Write-Error "Not in a git repository"; exit 1 }
Set-Location $RepoRoot

$packagePath = "package.json"
$manifestPath = "src/manifest.json"
$changelogPath = "CHANGELOG.md"

if (-not (Test-Path $packagePath)) { Write-Error "Missing $packagePath"; exit 1 }
if (-not (Test-Path $manifestPath)) { Write-Error "Missing $manifestPath"; exit 1 }
if (-not (Test-Path $changelogPath)) { Write-Error "Missing $changelogPath"; exit 1 }

$packageRaw = Get-Content $packagePath -Raw
$manifestRaw = Get-Content $manifestPath -Raw
$changelogRaw = Get-Content $changelogPath -Raw

$packageVersionMatch = [regex]::Match($packageRaw, '"version"\s*:\s*"(\d+\.\d+\.\d+)"')
$manifestVersionMatch = [regex]::Match($manifestRaw, '"version"\s*:\s*"(\d+\.\d+\.\d+)"')

if (-not $packageVersionMatch.Success) {
    Write-Error "Could not parse version from package.json"
    exit 1
}
if (-not $manifestVersionMatch.Success) {
    Write-Error "Could not parse version from src/manifest.json"
    exit 1
}

$currentVersion = $packageVersionMatch.Groups[1].Value
$manifestVersion = $manifestVersionMatch.Groups[1].Value
if ($currentVersion -ne $manifestVersion) {
    Write-Error "Version mismatch: package.json=$currentVersion, src/manifest.json=$manifestVersion"
    exit 1
}

$newVersion = Bump-Semver -Version $currentVersion -Part $Bump
$tag = "v$newVersion"
$today = Get-Date -Format "yyyy-MM-dd"

Write-Host "`n📦 Release: $currentVersion → $newVersion ($Bump bump)" -ForegroundColor Cyan

Write-Host "`n🔍 Preflight checks" -ForegroundColor Cyan

$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean. Commit or stash changes first."
    exit 1
}
Write-Host "  ✓ Working tree clean" -ForegroundColor Green

$branch = git branch --show-current
if ($branch -ne "main") {
    Write-Error "Must be on 'main' branch (currently on '$branch')."
    exit 1
}
Write-Host "  ✓ On main branch" -ForegroundColor Green

$existingTag = git tag -l $tag
if ($existingTag) {
    Write-Error "Tag '$tag' already exists."
    exit 1
}
Write-Host "  ✓ Tag $tag is available" -ForegroundColor Green

if ($changelogRaw -notmatch '## \[Unreleased\]\s*\n+### ') {
    Write-Error "No entries found under [Unreleased] in CHANGELOG.md."
    exit 1
}
Write-Host "  ✓ Changelog has unreleased entries" -ForegroundColor Green

Write-Host "`n🧪 Running checks..." -ForegroundColor Cyan

npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "Lint failed. Fix before releasing."
    exit 1
}
Write-Host "  ✓ Lint passed" -ForegroundColor Green

npm test
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tests failed. Fix before releasing."
    exit 1
}
Write-Host "  ✓ Tests passed" -ForegroundColor Green

npm run package
if ($LASTEXITCODE -ne 0) {
    Write-Error "Packaging failed. Fix before releasing."
    exit 1
}
Write-Host "  ✓ Packaging passed" -ForegroundColor Green

if ($DryRun) {
    Write-Host "`n📋 Dry run — would perform:" -ForegroundColor Yellow
    Write-Host "  1. Bump package.json version to $newVersion"
    Write-Host "  2. Bump src/manifest.json version to $newVersion"
    Write-Host "  3. Stamp CHANGELOG.md [Unreleased] → [$newVersion] - $today"
    Write-Host "  4. Commit: 'chore: release v$newVersion'"
    Write-Host "  5. Tag: $tag"
    if ($Push) { Write-Host "  6. Push to origin with tag" }
    Write-Host "  7. Release workflow creates GitHub Release and publishes to stores"
    exit 0
}

Write-Host "`n📦 Preparing release $tag" -ForegroundColor Cyan

$updatedPackage = $packageRaw -replace '"version"\s*:\s*"\d+\.\d+\.\d+"', """version"": ""$newVersion"""
$updatedManifest = $manifestRaw -replace '"version"\s*:\s*"\d+\.\d+\.\d+"', """version"": ""$newVersion"""
$updatedChangelog = $changelogRaw -replace '## \[Unreleased\]', "## [Unreleased]`n`n## [$newVersion] - $today"

Set-Content $packagePath -Value $updatedPackage -NoNewline
Set-Content $manifestPath -Value $updatedManifest -NoNewline
Set-Content $changelogPath -Value $updatedChangelog -NoNewline
Write-Host "  ✓ Updated package.json, src/manifest.json, CHANGELOG.md" -ForegroundColor Green

git add package.json src/manifest.json CHANGELOG.md
git commit -m "chore: release v$newVersion"
git tag -a $tag -m "Release $newVersion"
Write-Host "  ✓ Committed and tagged $tag" -ForegroundColor Green

if ($Push) {
    Write-Host "`n🚀 Pushing to origin..." -ForegroundColor Cyan
    git push origin main --follow-tags
    Write-Host "  ✓ Pushed — release workflow will run automatically" -ForegroundColor Green
} else {
    Write-Host "`n📌 Ready to push. Run:" -ForegroundColor Yellow
    Write-Host "  git push origin main --follow-tags" -ForegroundColor White
}

Write-Host "`n✅ Release $tag prepared successfully!`n" -ForegroundColor Green
