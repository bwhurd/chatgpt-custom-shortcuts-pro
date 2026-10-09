param(
    [Parameter(Mandatory = $true)]
    [string]$ProfileDirectory
)

$ErrorActionPreference = 'Stop'
$expectedDirectory = [System.IO.Path]::GetFullPath($ProfileDirectory).TrimEnd('\').Replace('/', '\').ToLowerInvariant()

# BEGIN TESTABLE CHROME COMMAND LINE PARSER
function ConvertFrom-WindowsCommandLine {
    param([string]$CommandLine)

    $parsedArguments = [System.Collections.Generic.List[string]]::new()
    $index = 0
    while ($index -lt $CommandLine.Length) {
        while ($index -lt $CommandLine.Length -and [char]::IsWhiteSpace($CommandLine[$index])) {
            $index++
        }
        if ($index -ge $CommandLine.Length) {
            break
        }

        $argument = [System.Text.StringBuilder]::new()
        $insideQuotes = $false
        while ($index -lt $CommandLine.Length) {
            if (-not $insideQuotes -and [char]::IsWhiteSpace($CommandLine[$index])) {
                break
            }

            $backslashCount = 0
            while ($index -lt $CommandLine.Length -and $CommandLine[$index] -eq '\') {
                $backslashCount++
                $index++
            }

            if ($index -lt $CommandLine.Length -and $CommandLine[$index] -eq '"') {
                for ($slashIndex = 0; $slashIndex -lt [int][Math]::Floor($backslashCount / 2); $slashIndex++) {
                    [void]$argument.Append('\')
                }
                if ($backslashCount % 2 -eq 1) {
                    [void]$argument.Append('"')
                }
                else {
                    $insideQuotes = -not $insideQuotes
                }
                $index++
                continue
            }

            for ($slashIndex = 0; $slashIndex -lt $backslashCount; $slashIndex++) {
                [void]$argument.Append('\')
            }
            if ($index -ge $CommandLine.Length) {
                break
            }

            [void]$argument.Append($CommandLine[$index])
            $index++
        }
        $parsedArguments.Add($argument.ToString())
    }

    return $parsedArguments.ToArray()
}

function Get-ChromeArgumentValues {
    param(
        [string[]]$Arguments,
        [string]$Name
    )

    $values = [System.Collections.Generic.List[string]]::new()
    $prefix = "$Name="
    for ($index = 0; $index -lt $Arguments.Count; $index++) {
        $argument = $Arguments[$index]
        if ($argument.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            $values.Add($argument.Substring($prefix.Length))
            continue
        }
        if ($argument.Equals($Name, [System.StringComparison]::OrdinalIgnoreCase)) {
            if ($index + 1 -lt $Arguments.Count -and -not $Arguments[$index + 1].StartsWith('--')) {
                $values.Add($Arguments[$index + 1])
                $index++
            }
            else {
                $values.Add('')
            }
        }
    }

    return $values.ToArray()
}

function Test-ChromeProfileLaunchArguments {
    param(
        [string[]]$Arguments,
        [string]$ExpectedDirectory
    )

    $userDataDirectories = @(Get-ChromeArgumentValues -Arguments $Arguments -Name '--user-data-dir')
    $debuggingPorts = @(Get-ChromeArgumentValues -Arguments $Arguments -Name '--remote-debugging-port')
    $actualDirectory = if ($userDataDirectories.Count -gt 0) { $userDataDirectories[0] } else { '' }
    $normalizedDirectory = $actualDirectory.Replace('/', '\').ToLowerInvariant().TrimEnd('\')
    $normalizedExpectedDirectory = $ExpectedDirectory.Replace('/', '\').ToLowerInvariant().TrimEnd('\')
    $userDataDirectories.Count -eq 1 -and
        $debuggingPorts.Count -eq 1 -and
        $debuggingPorts[0] -eq '9333' -and
        $normalizedDirectory -eq $normalizedExpectedDirectory
}

function Test-ChromeBrowserRootArguments {
    param(
        [string[]]$Arguments,
        [string]$ExpectedDirectory
    )

    $processTypes = @(Get-ChromeArgumentValues -Arguments $Arguments -Name '--type')
    $processTypes.Count -eq 0 -and
        (Test-ChromeProfileLaunchArguments -Arguments $Arguments -ExpectedDirectory $ExpectedDirectory)
}

function Test-ChromeExtensionsDisabled {
    param([string[]]$Arguments)

    foreach ($argument in $Arguments) {
        if ($argument -match '(?i)^--disable-extensions(?:-except)?(?:=|$)') {
            return $true
        }
    }
    return $false
}
# END TESTABLE CHROME COMMAND LINE PARSER

$chromeRoots = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
    $commandLine = [string]$_.CommandLine
    $arguments = @(ConvertFrom-WindowsCommandLine -CommandLine $commandLine)
    Test-ChromeBrowserRootArguments -Arguments $arguments -ExpectedDirectory $expectedDirectory
})

if ($chromeRoots.Count -ne 1) {
    Write-Output 'Current-page validation is unverified: run npm run playwright:chatgpt:setup-cdp-profile -- --pause-for-extension-setup to open standard Chrome CodexCleanProfile on CDP port 9333, then sign in.'
    exit 1
}

$chromeArguments = @(ConvertFrom-WindowsCommandLine -CommandLine ([string]$chromeRoots[0].CommandLine))
if (Test-ChromeExtensionsDisabled -Arguments $chromeArguments) {
    Write-Output 'Current-page validation is unverified: Chrome disables extensions. Relaunch with npm run playwright:chatgpt:setup-cdp-profile -- --pause-for-extension-setup.'
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
