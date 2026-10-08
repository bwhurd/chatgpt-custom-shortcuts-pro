param(
    [Parameter(Mandatory = $true)]
    [string]$ProfileDirectory
)

$ErrorActionPreference = 'Stop'
$expectedDirectory = [System.IO.Path]::GetFullPath($ProfileDirectory).TrimEnd('\').Replace('/', '\').ToLowerInvariant()
$chromeRoots = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
    $commandLine = [string]$_.CommandLine
    $normalized = $commandLine.Replace('/', '\').ToLowerInvariant()
    $pathMatch = [regex]::Match($normalized, '--user-data-dir(?:=|\s+)(?:"([^"]+)"|(\S+))')
    $actualDirectory = if ($pathMatch.Groups[1].Success) { $pathMatch.Groups[1].Value } else { $pathMatch.Groups[2].Value }
    $commandLine -match '--remote-debugging-port(?:=|\s+)9333(?:\s|$)' -and
        $actualDirectory.TrimEnd('\') -eq $expectedDirectory
})

if ($chromeRoots.Count -ne 1) {
    Write-Output 'Current-page validation is unverified: open the authenticated standard Chrome CodexCleanProfile with CDP port 9333 using the tray Setup Extension Profile action.'
    exit 1
}

if ($chromeRoots[0].CommandLine -match '--disable-extensions(?:-except)?(?:=|\s|$)') {
    Write-Output 'Current-page validation is unverified: Chrome disables extensions. Relaunch through the tray Setup Extension Profile action.'
    exit 1
}

$listeners = @(Get-NetTCPConnection -LocalPort 9333 -State Listen -ErrorAction SilentlyContinue | Where-Object {
    $_.LocalAddress -eq '127.0.0.1' -and $_.OwningProcess -eq $chromeRoots[0].ProcessId
})
if ($listeners.Count -eq 0) {
    Write-Output 'Current-page validation is unverified: port 9333 is not owned by the expected Chrome profile.'
    exit 1
}

Write-Output 'Verified local Chrome profile and CDP port 9333. Page readiness will be checked by the live capture.'
exit 0
