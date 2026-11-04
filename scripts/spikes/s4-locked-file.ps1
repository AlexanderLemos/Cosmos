# Spike S4: atomic write against a file locked by another program (plan §12.3).
# Usage (PowerShell, repository root): .\scripts\spikes\s4-locked-file.ps1
$ErrorActionPreference = "Stop"

$cosmos = (Get-Command cosmos -ErrorAction SilentlyContinue).Source
if (-not $cosmos) { throw "cosmos.exe not found on PATH. See scripts/spikes/README.md." }

$dir = Join-Path $env:TEMP "cosmos-s4"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$target = Join-Path $dir "context.md"
Set-Content -Path $target -Value "original content" -NoNewline

function Test-LockedWrite([int]$holdSeconds) {
    Write-Host ""
    Write-Host "=== Lock held for $holdSeconds s ==="
    $job = Start-Job -ScriptBlock {
        param($path, $seconds)
        $fs = [System.IO.File]::Open($path, 'Open', 'ReadWrite', 'None')  # exclusive, like an AV scan
        Start-Sleep -Seconds $seconds
        $fs.Close()
    } -ArgumentList $target, $holdSeconds
    Start-Sleep -Milliseconds 700  # let the job grab the lock

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $cosmos spike atomic-write $target --content "new content after $holdSeconds s lock"
    $code = $LASTEXITCODE
    $sw.Stop()
    Wait-Job $job | Out-Null; Remove-Job $job

    $leftovers = @(Get-ChildItem $dir -Force -Filter "*.cosmos-tmp")
    Write-Host ("exit={0} elapsed={1:n1}s content='{2}' tmp-leftovers={3}" -f `
        $code, $sw.Elapsed.TotalSeconds, (Get-Content $target -Raw), $leftovers.Count)
}

Write-Host "Windows: $([System.Environment]::OSVersion.VersionString)"
Write-Host "cosmos:  $(& $cosmos --version)"
Test-LockedWrite 2    # expected: exit=0, new content
Test-LockedWrite 10   # expected: exit=1 after ~5 s, previous content intact
Write-Host ""
Write-Host "Done. Please send this output."
