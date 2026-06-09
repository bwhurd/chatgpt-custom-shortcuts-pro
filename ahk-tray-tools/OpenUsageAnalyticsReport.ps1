$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$ExtensionPath = Resolve-Path (Join-Path $ProjectRoot 'extension')
$StoreExtensionId = 'figoaoelbmlhipinligdgmopdakcdkcf'
$ReportPage = 'usage-report.html'

function Get-ChromePath {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    return 'chrome.exe'
}

function Get-PreferenceCandidates {
    $roots = @(
        (Join-Path $ProjectRoot '_temp-files\cdp-manual-chrome-profile'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data')
    )

    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $prefs = Join-Path $_.FullName 'Preferences'
            if (Test-Path -LiteralPath $prefs) {
                [pscustomobject]@{
                    Preferences = $prefs
                    UserDataDir = $root
                }
            }
        }
    }
}

function Find-UnpackedExtension {
    $targetPath = [System.IO.Path]::GetFullPath($ExtensionPath.Path)
    foreach ($candidate in Get-PreferenceCandidates) {
        try {
            $json = Get-Content -LiteralPath $candidate.Preferences -Raw | ConvertFrom-Json
            $settings = $json.extensions.settings
            if (-not $settings) {
                continue
            }
            foreach ($property in $settings.PSObject.Properties) {
                $extension = $property.Value
                $extensionPathValue = [string]$extension.path
                if (-not $extensionPathValue) {
                    continue
                }
                $resolved = [System.IO.Path]::GetFullPath($extensionPathValue)
                if ([string]::Equals($resolved, $targetPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                    return [pscustomobject]@{
                        ExtensionId = $property.Name
                        UserDataDir = $candidate.UserDataDir
                    }
                }
            }
        } catch {
            continue
        }
    }
    return $null
}

$chrome = Get-ChromePath
$extension = Find-UnpackedExtension
if ($extension) {
    $url = "chrome-extension://$($extension.ExtensionId)/$ReportPage"
    Start-Process -FilePath $chrome -ArgumentList @("--user-data-dir=$($extension.UserDataDir)", $url)
    Write-Output "Opened usage report for unpacked extension: $url"
    return
}

$fallbackUrl = "chrome-extension://$StoreExtensionId/$ReportPage"
Start-Process -FilePath $chrome -ArgumentList @($fallbackUrl)
Write-Output "Opened usage report for store extension: $fallbackUrl"
