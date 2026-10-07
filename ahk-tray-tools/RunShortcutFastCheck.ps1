param(
    [switch]$PauseOnComplete
)

$repositoryRoot = [System.IO.Directory]::GetParent($PSScriptRoot).FullName
$mutexSuffix = $repositoryRoot.ToUpperInvariant() -replace '[^A-Z0-9]', '_'
$mutexName = "Local\CGCSP_FastShortcutCheck_$mutexSuffix"
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$ownsMutex = $false
$exitCode = 1

try {
    try {
        $ownsMutex = $mutex.WaitOne(0)
    }
    catch [System.Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }

    if (-not $ownsMutex) {
        [Console]::Error.WriteLine('Fast Shortcut Check is already running for this repository.')
        $exitCode = 2
    }
    else {
        Push-Location -LiteralPath $repositoryRoot
        try {
            $LASTEXITCODE = 1
            npm run test:shortcuts:fast
            $exitCode = $LASTEXITCODE
        }
        catch {
            Write-Error -ErrorRecord $_
            $exitCode = 1
        }
        finally {
            Pop-Location
        }
    }
}
finally {
    if ($ownsMutex) {
        try {
            $mutex.ReleaseMutex()
        }
        finally {
            $mutex.Dispose()
        }
    }
    else {
        $mutex.Dispose()
    }
}

Write-Host ''
Write-Host "Fast Shortcut Check finished with exit code $exitCode."
if ($PauseOnComplete) {
    Read-Host 'Press Enter to close this window' | Out-Null
}

exit $exitCode
