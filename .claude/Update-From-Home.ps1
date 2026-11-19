# Update-From-Home.ps1: copy the latest skills and agents from my Home
# (the GitHub repo barhnana/github-home) into this project's .claude folder.
#
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File .\.claude\Update-From-Home.ps1
#
# - Uses the version of the Home that is pushed to GitHub.
# - Asks before replacing skills or agents that already exist here (-Force skips the question).
# - Skills and agents with names that are not in the Home are left alone.
# - Remembers what came from the Home in .claude\.home.json.

[CmdletBinding()]
param(
    [switch]$Force,
    [string]$Repository = "barhnana/github-home",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$claudeRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $claudeRoot
$skillsRoot = Join-Path $claudeRoot "skills"
$agentsRoot = Join-Path $claudeRoot "agents"
$manifestPath = Join-Path $claudeRoot ".home.json"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("github-home-" + [guid]::NewGuid().ToString("N"))
$clonePath = Join-Path $tempRoot "home"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is required. Install it, run 'gh auth login', and make sure you can access $Repository."
}

# What came from the Home last time (so we know which folders belong to it)
$managedSkills = @()
$managedAgents = @()
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $managedSkills = @($manifest.skills)
    $managedAgents = @($manifest.agents)
}

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
try {
    & gh repo clone $Repository $clonePath -- "--depth=1" "--branch=$Branch" "--quiet"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not download $Repository. Check 'gh auth login' and your access to the repository."
    }

    $sourceSkills = @(
        Get-ChildItem -LiteralPath (Join-Path $clonePath ".claude\skills") -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") }
    )
    $sourceAgents = @(
        Get-ChildItem -LiteralPath (Join-Path $clonePath ".claude\agents") -Filter "*.md" -File -ErrorAction SilentlyContinue
    )
    if ($sourceSkills.Count -eq 0 -and $sourceAgents.Count -eq 0) {
        throw "No skills or agents were found in $Repository (.claude\skills, .claude\agents)."
    }

    # Which existing items would be replaced?
    $replacing = @()
    $unmanaged = @()
    foreach ($skill in $sourceSkills) {
        if (Test-Path -LiteralPath (Join-Path $skillsRoot $skill.Name)) {
            $replacing += "skills\$($skill.Name)"
            if ($managedSkills -notcontains $skill.Name) { $unmanaged += "skills\$($skill.Name)" }
        }
    }
    foreach ($agent in $sourceAgents) {
        if (Test-Path -LiteralPath (Join-Path $agentsRoot $agent.Name)) {
            $replacing += "agents\$($agent.Name)"
            if ($managedAgents -notcontains $agent.Name) { $unmanaged += "agents\$($agent.Name)" }
        }
    }

    if ($replacing.Count -gt 0 -and -not $Force) {
        Write-Host "These items in this project will be replaced with the Home version:"
        $replacing | ForEach-Object { Write-Host "  $_" }
        if ($unmanaged.Count -gt 0) {
            Write-Warning "These did not come from the Home before, so they may contain your own changes: $($unmanaged -join ', ')"
        }
        $answer = [string](Read-Host "Continue? (y/N)")   # [string]: no answer possible counts as "no"
        if ($answer -notmatch "^(y|yes|j|ja)$") {
            Write-Host "Update cancelled; nothing was changed."
            return
        }
    }

    New-Item -ItemType Directory -Force -Path $skillsRoot, $agentsRoot | Out-Null

    foreach ($skill in $sourceSkills) {
        $destination = Join-Path $skillsRoot $skill.Name
        # Replace the whole folder so files deleted in the Home disappear here too
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        Copy-Item -LiteralPath $skill.FullName -Destination $skillsRoot -Recurse
        Write-Host "Skill:  $($skill.Name)"
    }
    foreach ($agent in $sourceAgents) {
        Copy-Item -LiteralPath $agent.FullName -Destination $agentsRoot -Force
        Write-Host "Agent:  $($agent.Name)"
    }

    $obsolete = @($managedSkills | Where-Object { $sourceSkills.Name -notcontains $_ }) +
                @($managedAgents | Where-Object { $sourceAgents.Name -notcontains $_ })
    if ($obsolete.Count -gt 0) {
        Write-Warning "No longer in the Home, left in place: $($obsolete -join ', '). Delete them here if you do not need them."
    }

    # License notices for skills from other people
    $sourceNotices = Join-Path $clonePath "THIRD-PARTY-NOTICES"
    if (Test-Path -LiteralPath $sourceNotices) {
        $targetNotices = Join-Path $projectRoot "THIRD-PARTY-NOTICES"
        New-Item -ItemType Directory -Force -Path $targetNotices | Out-Null
        Get-ChildItem -LiteralPath $sourceNotices -File | Copy-Item -Destination $targetNotices -Force
    }

    $commit = (git -C $clonePath rev-parse HEAD)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not determine the Home commit."
    }

    $newManifest = [ordered]@{
        repository = $Repository
        branch     = $Branch
        commit     = $commit.Trim()
        skills     = @($managedSkills + $sourceSkills.Name | Sort-Object -Unique)
        agents     = @($managedAgents + $sourceAgents.Name | Sort-Object -Unique)
    }
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($manifestPath, ($newManifest | ConvertTo-Json -Depth 4), $utf8)

    Write-Host ""
    Write-Host "Copied $($sourceSkills.Count) skills and $($sourceAgents.Count) agents from $Repository ($($commit.Trim().Substring(0, 7)))."
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
