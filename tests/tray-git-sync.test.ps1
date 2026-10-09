param(
    [ValidateSet('Unit', 'Integration', 'All')]
    [string]$Phase = 'All'
)

$ErrorActionPreference = 'Stop'
$script:AssertionCount = 0
$script:RepositoryRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$script:HelperPath = Join-Path $script:RepositoryRoot 'ahk-tray-tools\GitPushSupport.ps1'
$script:ControllerPath = Join-Path $script:RepositoryRoot 'ahk-tray-tools\PushLocalToGit.ps1'

function Assert-True {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Condition,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    $script:AssertionCount++
    if (-not $Condition) {
        throw ('Assertion failed: ' + $Message)
    }
}

function Assert-False {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Condition,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    Assert-True -Condition (-not $Condition) -Message $Message
}

function Assert-Equal {
    param(
        [AllowNull()]
        [object]$Expected,
        [AllowNull()]
        [object]$Actual,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    $equal = ($Expected -ceq $Actual)
    Assert-True -Condition $equal -Message $Message
}

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    $thrown = $false
    try {
        & $Action
    }
    catch {
        $thrown = $true
    }
    Assert-True -Condition $thrown -Message $Message
}

function ConvertFrom-TestSecureString {
    param(
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]$Value
    )
    $pointer = [System.IntPtr]::Zero
    try {
        $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($Value)
        return [System.Runtime.InteropServices.Marshal]::PtrToStringUni($pointer)
    }
    finally {
        if ($pointer -ne [System.IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($pointer)
        }
    }
}

function Test-IgnorePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )
    & git -C $script:RepositoryRoot check-ignore --no-index -q -- $Path
    return ($LASTEXITCODE -eq 0)
}

function Assert-SafeFixturePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FixtureRoot,
        [Parameter(Mandatory = $true)]
        [string]$Candidate
    )
    $fullFixture = [System.IO.Path]::GetFullPath($FixtureRoot).TrimEnd('\', '/')
    $fullCandidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
    if ($fullCandidate.Equals($script:RepositoryRoot.TrimEnd('\', '/'), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The test harness refuses the production working repository.'
    }
    if (-not $fullCandidate.StartsWith(($fullFixture + [System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The test harness fixture escaped its unique system-temp directory.'
    }
}

function Invoke-TestGit {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    $output = & git -C $RepositoryRoot @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ('A disposable fixture Git operation failed at test line ' + $MyInvocation.ScriptLineNumber + ' (exit ' + $LASTEXITCODE + '; git ' + ($Arguments -join ' ') + ').')
    }
    return (@($output) -join [Environment]::NewLine)
}

function New-TestResponseBody {
    param([Parameter(Mandatory = $true)][string]$Subject)
    return (@{
        id = 'resp_synthetic'
        status = 'completed'
        usage = @{ input_tokens = 14; output_tokens = 3; total_tokens = 17 }
        output = @(@{
            type = 'message'
            role = 'assistant'
            content = @(@{ type = 'output_text'; text = $Subject })
        })
    } | ConvertTo-Json -Depth 8 -Compress)
}

function Get-TestMockTransport {
    return {
        param($Uri, $Headers, $BodyBytes, $TimeoutSeconds)
        $script:MockCalls++
        $script:MockUris += [string]$Uri
        $script:MockTimeouts += [int]$TimeoutSeconds
        $script:MockPayloads += [System.Text.Encoding]::UTF8.GetString($BodyBytes)
        $script:MockAuthorization = [string]$Headers.Authorization
        if ($null -ne $script:MockCallback) {
            & $script:MockCallback $Uri $Headers $BodyBytes $TimeoutSeconds
        }
        if ($script:MockAdvanceSeconds -gt 0) {
            $script:MockNow = $script:MockNow.AddSeconds($script:MockAdvanceSeconds)
        }
        if ($script:MockQueue.Count -gt 0) {
            $response = $script:MockQueue[0]
            $script:MockQueue = @($script:MockQueue | Select-Object -Skip 1)
            return $response
        }
        return [pscustomobject]@{ StatusCode = $script:MockStatus; Body = $script:MockBody; RetryAfter = $script:MockRetryAfter; TimedOut = $script:MockTimedOut }
    }
}

function Invoke-UnitPhase {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FixtureRoot
    )

    $repoFixture = Join-Path $FixtureRoot 'repo fixture'
    $settingsRoot = Join-Path $FixtureRoot 'local app data'
    $null = New-Item -ItemType Directory -Path $repoFixture -Force
    Assert-SafeFixturePath -FixtureRoot $FixtureRoot -Candidate $repoFixture

    $previousLocalAppData = $env:LOCALAPPDATA
    $env:LOCALAPPDATA = Join-Path $FixtureRoot 'implicit local app data'
    try {
        $importOutput = . $script:HelperPath
        Assert-Equal -Expected 0 -Actual @($importOutput).Count -Message 'dot-sourcing emits no output'
        Assert-False -Condition (Test-Path -LiteralPath $env:LOCALAPPDATA) -Message 'dot-sourcing creates no settings directory'
    }
    finally {
        $env:LOCALAPPDATA = $previousLocalAppData
    }

    $repoId = Get-GitPushRepoId -RepositoryRoot $repoFixture
    $sameRepoId = Get-GitPushRepoId -RepositoryRoot ($repoFixture + '\')
    $caseVariantRepoId = Get-GitPushRepoId -RepositoryRoot $repoFixture.ToUpperInvariant()
    Assert-Equal -Expected $repoId -Actual $sameRepoId -Message 'repository ID normalizes trailing separators'
    Assert-Equal -Expected $repoId -Actual $caseVariantRepoId -Message 'repository ID normalizes path case'
    Assert-Equal -Expected 32 -Actual $repoId.Length -Message 'repository ID has a bounded stable length'

    Assert-Throws -Action {
        Get-GitPushSettings -RepositoryRoot $repoFixture -SettingsRoot (Join-Path $repoFixture 'inside-repository')
    } -Message 'settings root inside the repository is rejected'

    $initialSettings = Get-GitPushSettings -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot
    Assert-True -Condition $initialSettings.AiSubjectsEnabled -Message 'AI subjects default to enabled for a future configured key'
    Assert-False -Condition $initialSettings.HasApiKey -Message 'missing key is reported without environment fallback'
    Assert-False -Condition (Test-Path -LiteralPath $settingsRoot) -Message 'reading settings creates no directory'

    $savedSettings = Save-GitPushSettings -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot -Settings ([pscustomobject]@{
        AiSubjectsEnabled = $false
    })
    Assert-False -Condition $savedSettings.AiSubjectsEnabled -Message 'settings save records the disabled choice'
    $savedSettings = Save-GitPushSettings -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot -Settings @{
        AiSubjectsEnabled = $true
    }
    Assert-True -Condition $savedSettings.AiSubjectsEnabled -Message 'settings save can atomically replace a prior value'

    $paths = Get-GitPushSettingsPaths -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot
    Assert-False -Condition (Test-GitPushPathInside -Path $paths.SettingsFile -Root $repoFixture) -Message 'settings file remains outside the repository'
    Assert-True -Condition ([System.IO.File]::Exists($paths.SettingsFile)) -Message 'settings JSON is written'
    $settingsJson = [System.IO.File]::ReadAllText($paths.SettingsFile)
    Assert-False -Condition ($settingsJson.Contains('sk-proj-')) -Message 'settings JSON contains no API key'
    Assert-Equal -Expected 0 -Actual @(Get-ChildItem -Force -LiteralPath $paths.Directory -Filter '*.tmp' -ErrorAction SilentlyContinue).Count -Message 'atomic settings save leaves no temporary file'

    $syntheticKey = ('sk-proj-' + ('a' * 32))
    $previousApiKey = $env:OPENAI_API_KEY
    $env:OPENAI_API_KEY = $syntheticKey
    try {
        Assert-Equal -Expected $null -Actual (Get-GitPushApiKey -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot) -Message 'the helper does not reuse OPENAI_API_KEY'
    }
    finally {
        if ($null -eq $previousApiKey) {
            Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
        }
        else {
            $env:OPENAI_API_KEY = $previousApiKey
        }
    }

    $secureKey = ConvertTo-GitPushSecureString -Text $syntheticKey
    try {
        Set-GitPushApiKey -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot -ApiKey $secureKey
    }
    finally {
        $secureKey.Dispose()
    }
    Assert-True -Condition ([System.IO.File]::Exists($paths.KeyFile)) -Message 'DPAPI key file is written separately'
    Assert-False -Condition (Test-GitPushPathInside -Path $paths.KeyFile -Root $repoFixture) -Message 'DPAPI key file remains outside the repository'
    $protectedText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($paths.KeyFile))
    Assert-False -Condition ($protectedText.Contains($syntheticKey)) -Message 'DPAPI file does not contain the plaintext key'

    $roundTripKey = Get-GitPushApiKey -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot
    try {
        Assert-Equal -Expected $syntheticKey -Actual (ConvertFrom-TestSecureString -Value $roundTripKey) -Message 'DPAPI CurrentUser key round trip succeeds'
    }
    finally {
        $roundTripKey.Dispose()
    }
    $settingsJson = [System.IO.File]::ReadAllText($paths.SettingsFile)
    Assert-False -Condition ($settingsJson.Contains($syntheticKey)) -Message 'settings JSON does not contain the synthetic key'
    Assert-False -Condition ($settingsJson.Contains('apiKey')) -Message 'settings JSON has no key property'
    Assert-True -Condition (Get-GitPushSettings -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot).HasApiKey -Message 'configured status derives from the protected key file'
    Remove-GitPushApiKey -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot
    Assert-False -Condition ([System.IO.File]::Exists($paths.KeyFile)) -Message 'Remove key deletes the protected key file'
    Assert-False -Condition (Get-GitPushSettings -RepositoryRoot $repoFixture -SettingsRoot $settingsRoot).HasApiKey -Message 'removed key is reported as not configured'

    $ignoredPaths = @(
        '.env.production',
        '.envrc',
        'nested/.env.local.backup',
        'ahk-tray-tools/openai-key.dpapi',
        'ahk-tray-tools/openai-key.dpapi.bak',
        'ahk-tray-tools/settings.json',
        'ahk-tray-tools/settings.json.bak',
        'ahk-tray-tools/tray-git-sync.local/key-backup.txt',
        'tray-git-sync.local/key-backup.txt'
    )
    foreach ($path in $ignoredPaths) {
        Assert-True -Condition (Test-IgnorePath -Path $path) -Message ('private path is ignored: ' + $path)
    }
    foreach ($path in @(
        'ahk-tray-tools/PushLocalToGit.ps1',
        'ahk-tray-tools/GitPushSupport.ps1',
        'ahk-tray-tools/ConfigureGitPush.ps1',
        'tests/tray-git-sync.test.ps1'
    )) {
        Assert-False -Condition (Test-IgnorePath -Path $path) -Message ('intended source is visible: ' + $path)
    }

    foreach ($candidate in @(
        @{ Value = ''; Valid = $false; Name = 'empty' },
        @{ Value = ('a' * 52); Valid = $true; Name = '52-character' },
        @{ Value = ('a' * 53); Valid = $false; Name = '53-character' },
        @{ Value = 'first line' + [Environment]::NewLine + 'second line'; Valid = $false; Name = 'multiline' },
        @{ Value = 'Caf' + [char]0x00E9; Valid = $false; Name = 'non-ASCII' },
        @{ Value = 'Update files'; Valid = $false; Name = 'generic' },
        @{ Value = 'Tray local sync 2026-09-28 19:08:38'; Valid = $false; Name = 'timestamp sync' },
        @{ Value = 'https://example.invalid/change'; Valid = $false; Name = 'URL' },
        @{ Value = 'Bearer token123'; Valid = $false; Name = 'credential-like' }
    )) {
        Assert-Equal -Expected ([bool]$candidate.Valid) -Actual (Test-GitPushCommitSubject -Subject ([string]$candidate.Value)) -Message ('subject validation handles ' + $candidate.Name)
    }
    Assert-Equal -Expected 30.0 -Actual (ConvertTo-GitPushRetryAfterSeconds -RetryAfter '300') -Message 'Retry-After delay is capped'
    Assert-Equal -Expected 0.0 -Actual (ConvertTo-GitPushRetryAfterSeconds -RetryAfter '-4') -Message 'negative Retry-After becomes zero'
    Assert-Equal -Expected 'invalid_api_key' -Actual (Get-GitPushApiErrorCategory -StatusCode 401 -Body 'private body') -Message '401 maps to a safe key category'
    Assert-Equal -Expected 'api_forbidden' -Actual (Get-GitPushApiErrorCategory -StatusCode 403 -Body '') -Message '403 maps to a safe permission category'
    Assert-Equal -Expected 'unsupported_model_or_endpoint' -Actual (Get-GitPushApiErrorCategory -StatusCode 404 -Body '') -Message '404 maps to a safe endpoint category'
    Assert-Equal -Expected 'rate_limited' -Actual (Get-GitPushApiErrorCategory -StatusCode 429 -Body 'try later') -Message 'ordinary 429 maps to rate limited'
    Assert-Equal -Expected 'server_error' -Actual (Get-GitPushApiErrorCategory -StatusCode 503 -Body '') -Message '5xx maps to a server category'
    Assert-Equal -Expected 'unsupported_model_or_effort' -Actual (Get-GitPushApiErrorCategory -StatusCode 400 -Body 'unsupported reasoning effort') -Message 'unsupported model settings are classified'
    Assert-Equal -Expected 'reasoning_budget_exhausted' -Actual (Get-GitPushApiErrorCategory -StatusCode 429 -Body 'reasoning budget exhausted') -Message 'reasoning budget exhaustion is distinct'
    Assert-Equal -Expected 'network_error' -Actual (Get-GitPushApiErrorCategory -StatusCode 0 -Body '') -Message 'network failures have a safe category'

    $parsedGood = Get-GitPushResponseText -Body (New-TestResponseBody -Subject 'Describe staged change')
    Assert-True -Condition $parsedGood.Success -Message 'a completed single output_text response is accepted'
    Assert-Equal -Expected 'Describe staged change' -Actual $parsedGood.Subject -Message 'response extraction returns only the subject'
    Assert-Equal -Expected 14 -Actual $parsedGood.Usage.input_tokens -Message 'response parser retains numeric input usage only'
    Assert-Equal -Expected 'malformed_response' -Actual (Get-GitPushResponseText -Body '{not json').Category -Message 'malformed JSON is rejected safely'
    Assert-Equal -Expected 'incomplete_response' -Actual (Get-GitPushResponseText -Body '{"status":"incomplete","output":[]}').Category -Message 'incomplete responses are rejected'
    Assert-Equal -Expected 'incomplete_response' -Actual (Get-GitPushResponseText -Body '{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[]}').Category -Message 'output-token truncation is classified as incomplete'
    Assert-Equal -Expected 'refusal' -Actual (Get-GitPushResponseText -Body '{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"refusal","refusal":"no"}]}]}').Category -Message 'refusal output is rejected'
    Assert-Equal -Expected 'malformed_response' -Actual (Get-GitPushResponseText -Body '{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"One"},{"type":"output_text","text":"Two"}]}]}').Category -Message 'multiple output_text items are rejected'
    Assert-Equal -Expected 'invalid_subject' -Actual (Get-GitPushResponseText -Body (New-TestResponseBody -Subject ('a' * 53))).Category -Message 'overlong model output is rejected'

    $fallbackEvidence = [pscustomobject]@{
        ChangedCount = 2
        Changes = @(
            [pscustomobject]@{ status = 'D'; path = 'obsolete notes.md' },
            [pscustomobject]@{ status = 'D'; path = 'old config.json' }
        )
    }
    $fallback = New-GitPushFallbackSubject -Evidence $fallbackEvidence
    Assert-True -Condition (Test-GitPushCommitSubject -Subject $fallback) -Message 'file-summary fallback is a valid one-line subject'
    Assert-True -Condition ($fallback.Length -le 52) -Message 'file-summary fallback stays within 52 characters'
    Assert-True -Condition ($fallback.StartsWith('Remove ')) -Message 'file-summary fallback describes deleted files'
    Assert-Equal -Expected 'sensitive-environment-file' -Actual (Get-GitPushSensitivePathReason -Path '.env.production') -Message 'environment evidence is classified as private'
    Assert-Equal -Expected 'sensitive-environment-file' -Actual (Get-GitPushSensitivePathReason -Path '.envrc') -Message 'all .env-prefixed files are classified as private'
    Assert-Equal -Expected 'sensitive-key-file' -Actual (Get-GitPushSensitivePathReason -Path 'docs/openai-key.dpapi.bak') -Message 'key backups are classified as private'
    Assert-Equal -Expected 'sensitive-configuration-path' -Actual (Get-GitPushSensitivePathReason -Path 'ahk-tray-tools/settings.json.bak') -Message 'tray settings backups are classified as private'
    Assert-Equal -Expected 'sensitive-configuration-path' -Actual (Get-GitPushSensitivePathReason -Path 'tray-git-sync.local/key-backup.txt') -Message 'tray-local configuration paths are classified as private'
    Assert-Equal -Expected 'sensitive-credential-path' -Actual (Get-GitPushSensitivePathReason -Path 'private/google-token.json') -Message 'token data files are classified as private'
    Assert-Equal -Expected '' -Actual (Get-GitPushSensitivePathReason -Path 'netlify/functions/google-token.js') -Message 'source files named for token handling are allowed'
    Assert-Equal -Expected '' -Actual (Get-GitPushSensitivePathReason -Path 'tests/fixtures/settings.json') -Message 'settings test fixtures are allowed'
    Assert-Equal -Expected 5 -Actual (Get-GitPushUtf8ByteCount -Text (Limit-GitPushUtf8Text -Text ('a' + [char]::ConvertFromUtf32(0x1F600) + 'bc') -MaximumBytes 5 -Suffix '')) -Message 'UTF-8 truncation preserves whole Unicode characters'
    Assert-Throws -Action { ConvertTo-GitPushNote -Note ('n' * 1001) } -Message 'one-run note has a 1,000-character limit'

    $inventory = @()
    for ($index = 0; $index -lt 125; $index++) {
        $inventory += [pscustomobject]@{
            Status = 'M'; Path = ('area/file-' + $index + '.txt'); OldPath = $null; NewPath = $null
            OldMode = '100644'; NewMode = '100644'; OldOid = 'a'; NewOid = 'b'
            OldBlobSize = 1; NewBlobSize = 1; Additions = '1'; Deletions = '0'
            IsBinary = $true; PatchOmittedReason = ''
        }
    }
    $boundedEvidence = New-GitPushEvidence -RepositoryRoot $repoFixture -Branch 'test' -BaseTree 'base' -SnapshotTree 'snapshot' -Changes $inventory
    Assert-Equal -Expected 125 -Actual $boundedEvidence.ChangedCount -Message 'evidence retains the full changed count'
    Assert-Equal -Expected 120 -Actual $boundedEvidence.Changes.Count -Message 'evidence inventory is capped at 120 entries'
    Assert-Equal -Expected 5 -Actual $boundedEvidence.Omissions['inventory-over-120'] -Message 'inventory omissions are counted'
    foreach ($evidenceChange in $boundedEvidence.Changes) {
        Assert-Equal -Expected 'binary-content' -Actual $evidenceChange.patchOmittedReason -Message 'binary file contents are never selected'
    }

    $fixtureGit = Join-Path $FixtureRoot 'evidence repo'
    $null = New-Item -ItemType Directory -Path $fixtureGit -Force
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('init', '--quiet', '-b', 'main') | Out-Null
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('config', 'user.name', 'Tray Fixture') | Out-Null
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('config', 'user.email', 'tray-fixture@example.invalid') | Out-Null
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('config', 'commit.gpgsign', 'false') | Out-Null
    $null = New-Item -ItemType Directory -Path (Join-Path $fixtureGit 'docs') -Force
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'README.md'), ('base summary' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'docs/old-guide.md'), ('Guide overview' + [Environment]::NewLine + 'Stable first section' + [Environment]::NewLine + 'Stable second section' + [Environment]::NewLine + 'Stable closing section' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'obsolete.txt'), ('remove this' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('add', '--all', '--', '.') | Out-Null
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('commit', '--quiet', '-m', 'Fixture base') | Out-Null
    $fixtureBaseTree = Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('rev-parse', 'HEAD^{tree}')
    $syntheticPatchSecret = 'sk-proj-' + ('z' * 32)
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'README.md'), ('describe an improvement' + [Environment]::NewLine + 'api_key=' + $syntheticPatchSecret + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('mv', 'docs/old-guide.md', 'docs/new-guide.md') | Out-Null
    [System.IO.File]::AppendAllText((Join-Path $fixtureGit 'docs/new-guide.md'), ('updated guide' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    Remove-Item -LiteralPath (Join-Path $fixtureGit 'obsolete.txt') -Force
    $null = New-Item -ItemType Directory -Path (Join-Path $fixtureGit 'vendor') -Force
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit '.env.production'), ('OPENAI_API_KEY=' + $syntheticPatchSecret), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'vendor/third-party.txt'), 'vendor data', [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllBytes((Join-Path $fixtureGit 'binary.dat'), [byte[]]@(0, 1, 2, 0, 255, 1))
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'large.dat'), ('L' * 262145), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText((Join-Path $fixtureGit 'naïve-notes.md'), 'unicode path', [System.Text.Encoding]::UTF8)
    Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('add', '--all', '--', '.') | Out-Null
    $fixtureSnapshotTree = Invoke-TestGit -RepositoryRoot $fixtureGit -Arguments @('write-tree')
    $evidence = Get-GitPushStagedEvidence -RepositoryRoot $fixtureGit -Branch 'main' -BaseTree $fixtureBaseTree -SnapshotTree $fixtureSnapshotTree -Note ('Prioritize docs; API_KEY=' + $syntheticPatchSecret)
    Assert-True -Condition ($evidence.ChangedCount -ge 8) -Message ('evidence captures the staged snapshot inventory; count=' + $evidence.ChangedCount)
    Assert-True -Condition (@($evidence.Changes | Where-Object { $_.status -eq 'D' -and $_.path -eq 'obsolete.txt' }).Count -eq 1) -Message 'deleted paths are represented'
    Assert-True -Condition (@($evidence.Changes | Where-Object { $_.status -match '^R' -and $_.oldPath -eq 'docs/old-guide.md' -and $_.newPath -eq 'docs/new-guide.md' }).Count -eq 1) -Message 'renames preserve old and new paths'
    Assert-True -Condition (@($evidence.Changes | Where-Object { $_.path -eq '.env.production' -and $_.patchOmittedReason -eq 'sensitive-environment-file' }).Count -eq 1) -Message 'sensitive environment file is represented without content'
    Assert-True -Condition (@($evidence.Changes | Where-Object { $_.path -eq 'binary.dat' -and $_.patchOmittedReason -eq 'binary-content' }).Count -eq 1) -Message 'binary file is represented without content'
    Assert-True -Condition (@($evidence.Changes | Where-Object { $_.path -eq 'large.dat' -and $_.patchOmittedReason -eq 'blob-over-256-kib' }).Count -eq 1) -Message 'oversized blob is represented without content'
    Assert-True -Condition (@($evidence.Changes | Where-Object { $_.path -eq 'vendor/third-party.txt' -and $_.patchOmittedReason -eq 'vendor-or-generated-content' }).Count -eq 1) -Message 'vendor file is represented without content'
    Assert-False -Condition ($evidence.Note.Contains($syntheticPatchSecret)) -Message 'change note redacts a synthetic credential'
    $allPatchText = @($evidence.Patches | ForEach-Object { $_.text }) -join [Environment]::NewLine
    Assert-False -Condition ($allPatchText.Contains($syntheticPatchSecret)) -Message 'patch evidence redacts a synthetic credential'
    Assert-True -Condition ($evidence.Patches.Count -le 24) -Message 'patch count stays within its cap'
    $patchBytes = 0
    foreach ($patch in $evidence.Patches) {
        $patchBytes += Get-GitPushUtf8ByteCount -Text $patch.text
        Assert-True -Condition ((Get-GitPushUtf8ByteCount -Text $patch.text) -le 6144) -Message 'each patch stays within its byte cap'
    }
    Assert-True -Condition ($patchBytes -le 49152) -Message 'total patch context stays within its byte cap'

    $request = ConvertTo-GitPushRequestBytes -Evidence $evidence
    Assert-True -Condition ($request.Bytes.Length -le 65536) -Message 'serialized request stays within 64 KiB'
    $requestObject = ConvertFrom-Json -InputObject $request.Json
    Assert-Equal -Expected 'gpt-5.6-terra' -Actual $requestObject.model -Message 'request fixes the Terra model'
    Assert-Equal -Expected 'high' -Actual $requestObject.reasoning.effort -Message 'request fixes high reasoning effort'
    Assert-False -Condition $requestObject.store -Message 'request disables response storage'
    Assert-False -Condition $requestObject.stream -Message 'request disables streaming'
    Assert-False -Condition ($request.Json.Contains($syntheticPatchSecret)) -Message 'serialized API request contains no synthetic credential'

    $oversizedChanges = @()
    for ($index = 0; $index -lt 120; $index++) {
        $oversizedChanges += [pscustomobject]@{
            status = 'M'; path = ('area/file-' + $index + '-' + ('x' * 96))
            oldPath = $null; newPath = $null; additions = '20'; deletions = '10'
            patchOmittedReason = ''
        }
    }
    $oversizedPatches = @()
    for ($index = 0; $index -lt 24; $index++) {
        $oversizedPatches += [pscustomobject]@{
            path = ('area/file-' + $index + '.txt'); text = ('p' * 6144); truncated = $false
        }
    }
    $oversizedEvidence = [pscustomobject]@{
        Branch = 'main'; BaseTree = 'base'; SnapshotTree = 'snapshot'; ChangedCount = 120
        Changes = $oversizedChanges; Patches = $oversizedPatches; Note = ('n' * 1000); Omissions = @{}
    }
    $oversizedRequest = ConvertTo-GitPushRequestBytes -Evidence $oversizedEvidence
    Assert-True -Condition ($oversizedRequest.Bytes.Length -le 65536) -Message 'oversized evidence is reduced to the serialized request cap'
    $oversizedPayload = ConvertFrom-Json -InputObject $oversizedRequest.Json
    $oversizedEvidencePayload = ConvertFrom-Json -InputObject $oversizedPayload.input[0].content[0].text
    Assert-True -Condition ($oversizedEvidencePayload.patches.Count -lt 24) -Message 'request reduction records omitted or shortened patches'
    Assert-True -Condition ($null -ne $oversizedEvidencePayload.omissions.PSObject.Properties['request-byte-budget']) -Message 'request byte-budget omissions are identified'

    $script:MockCalls = 0
    $script:MockUris = @()
    $script:MockTimeouts = @()
    $script:MockPayloads = @()
    $script:MockAuthorization = ''
    $script:MockQueue = @()
    $script:MockStatus = 200
    $script:MockBody = New-TestResponseBody -Subject 'Describe staged changes'
    $script:MockRetryAfter = $null
    $script:MockTimedOut = $false
    $script:MockAdvanceSeconds = 0
    $script:MockNow = [DateTimeOffset]::UtcNow
    $mockClock = { $script:MockNow }
    $mockSleeper = { param($seconds) $script:MockNow = $script:MockNow.AddSeconds($seconds) }
    $mockSecureKey = ConvertTo-GitPushSecureString -Text $syntheticKey
    try {
        $transport = Get-TestMockTransport
        $generation = Invoke-GitPushGeneration -Evidence $evidence -ApiKey $mockSecureKey -ResponseTransport $transport -Clock $mockClock -Sleeper $mockSleeper
        Assert-True -Condition $generation.Success -Message 'mocked valid API response produces a subject'
        Assert-Equal -Expected 'Describe staged changes' -Actual $generation.Subject -Message 'mocked API subject is extracted'
        Assert-Equal -Expected 1 -Actual $generation.RequestCount -Message 'successful response needs one request'
        Assert-Equal -Expected 17 -Actual $generation.Usage.total_tokens -Message 'generation returns safe numeric usage metadata'
        Assert-Equal -Expected 1 -Actual $script:MockCalls -Message 'mock transport is called once'
        Assert-Equal -Expected 'https://api.openai.com/v1/responses' -Actual $script:MockUris[0] -Message 'request uses the Responses API endpoint'
        Assert-True -Condition ($script:MockTimeouts[0] -le 45) -Message 'per-request timeout is bounded to 45 seconds'
        Assert-Equal -Expected ('Bearer ' + $syntheticKey) -Actual $script:MockAuthorization -Message 'synthetic key is sent only as authorization'
        Assert-False -Condition ($script:MockPayloads[0].Contains($syntheticKey)) -Message 'request payload does not contain the API key'
        Assert-False -Condition ($generation.SafeStatus.Contains($syntheticKey)) -Message 'success status does not contain credentials'
    }
    finally {
        $mockSecureKey.Dispose()
    }

    $script:MockCalls = 0
    $script:MockQueue = @(
        [pscustomobject]@{ StatusCode = 200; Body = (New-TestResponseBody -Subject 'Update files'); RetryAfter = $null; TimedOut = $false },
        [pscustomobject]@{ StatusCode = 200; Body = (New-TestResponseBody -Subject 'Describe staged changes'); RetryAfter = $null; TimedOut = $false }
    )
    $script:MockNow = [DateTimeOffset]::UtcNow
    $mockSecureKey = ConvertTo-GitPushSecureString -Text $syntheticKey
    try {
        $generation = Invoke-GitPushGeneration -Evidence $evidence -ApiKey $mockSecureKey -ResponseTransport (Get-TestMockTransport) -Clock $mockClock -Sleeper $mockSleeper
        Assert-True -Condition $generation.Success -Message 'invalid model subject receives one corrective retry'
        Assert-Equal -Expected 2 -Actual $generation.RequestCount -Message 'invalid subject retry is capped at two requests'
    }
    finally { $mockSecureKey.Dispose() }

    $script:MockCalls = 0
    $script:MockQueue = @(
        [pscustomobject]@{ StatusCode = 429; Body = 'rate limited'; RetryAfter = '300'; TimedOut = $false },
        [pscustomobject]@{ StatusCode = 200; Body = (New-TestResponseBody -Subject 'Describe staged changes'); RetryAfter = $null; TimedOut = $false }
    )
    $script:MockNow = [DateTimeOffset]::UtcNow
    $script:MockAdvanceSeconds = 0
    $script:MockSecureStart = [DateTimeOffset]::UtcNow
    $mockSecureKey = ConvertTo-GitPushSecureString -Text $syntheticKey
    try {
        $generation = Invoke-GitPushGeneration -Evidence $evidence -ApiKey $mockSecureKey -ResponseTransport (Get-TestMockTransport) -Clock $mockClock -Sleeper $mockSleeper
        Assert-True -Condition $generation.Success -Message 'transient 429 retries once then succeeds'
        Assert-Equal -Expected 2 -Actual $generation.RequestCount -Message 'transient retry is capped at two requests'
        Assert-True -Condition (($script:MockNow - $script:MockSecureStart).TotalSeconds -le 30) -Message 'Retry-After wait is capped at 30 seconds'
    }
    finally { $mockSecureKey.Dispose() }

    $script:MockCalls = 0
    $script:MockQueue = @()
    $script:MockStatus = 503
    $script:MockBody = 'untrusted synthetic response'
    $script:MockRetryAfter = '0'
    $script:MockAdvanceSeconds = 90
    $script:MockStart = [DateTimeOffset]::UtcNow
    $script:MockNow = $script:MockStart
    $mockSecureKey = ConvertTo-GitPushSecureString -Text $syntheticKey
    try {
        $generation = Invoke-GitPushGeneration -Evidence $evidence -ApiKey $mockSecureKey -ResponseTransport (Get-TestMockTransport) -Clock $mockClock -Sleeper $mockSleeper
        Assert-False -Condition $generation.Success -Message 'request finishing after the total deadline fails'
        Assert-Equal -Expected 'total_deadline_exceeded' -Actual $generation.Category -Message 'total deadline has a stable safe category'
        Assert-Equal -Expected 1 -Actual $generation.RequestCount -Message 'deadline prevents a retry'
        Assert-False -Condition ($generation.SafeStatus.Contains($script:MockBody)) -Message 'failure status omits raw API response'
    }
    finally { $mockSecureKey.Dispose() }

    $script:MockStatus = 401
    $script:MockAdvanceSeconds = 0
    $script:MockRetryAfter = $null
    $mockSecureKey = ConvertTo-GitPushSecureString -Text $syntheticKey
    try {
        $selected = Get-GitPushCommitSubject -Evidence $evidence -Settings ([pscustomobject]@{ AiSubjectsEnabled = $true }) -ApiKey $mockSecureKey -ResponseTransport (Get-TestMockTransport) -Clock $mockClock -Sleeper $mockSleeper
        Assert-Equal -Expected 'file-summary' -Actual $selected.Source -Message 'API failure selects factual file-summary fallback'
        Assert-Equal -Expected 'invalid_api_key' -Actual $selected.FailureCategory -Message 'fallback status keeps a safe failure category'
        Assert-True -Condition (Test-GitPushCommitSubject -Subject $selected.Subject) -Message 'fallback subject passes local validation'
    }
    finally { $mockSecureKey.Dispose() }
    $script:MockStatus = 200
    $script:MockBody = New-TestResponseBody -Subject 'Describe staged changes'
    $script:MockQueue = @()
    $script:MockCalls = 0
    $noKeySelection = Get-GitPushCommitSubject -Evidence $evidence -Settings ([pscustomobject]@{ AiSubjectsEnabled = $true }) -ApiKey $null -ResponseTransport (Get-TestMockTransport)
    Assert-Equal -Expected 'missing_api_key' -Actual $noKeySelection.FailureCategory -Message 'missing key falls back without an API call'
    Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'missing key never calls transport'
    $disabledSelection = Get-GitPushCommitSubject -Evidence $evidence -Settings ([pscustomobject]@{ AiSubjectsEnabled = $false }) -ApiKey $null -ResponseTransport (Get-TestMockTransport)
    Assert-Equal -Expected 'disabled' -Actual $disabledSelection.FailureCategory -Message 'disabled setting selects fallback'
    $emptyEvidence = [pscustomobject]@{ ChangedCount = 0; Changes = @(); Patches = @(); Note = '' }
    $emptySelection = Get-GitPushCommitSubject -Evidence $emptyEvidence -Settings ([pscustomobject]@{ AiSubjectsEnabled = $true }) -ApiKey $null -ResponseTransport (Get-TestMockTransport)
    Assert-Equal -Expected 'none' -Actual $emptySelection.Source -Message 'empty staged snapshot does not generate a subject'
    Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'empty staged snapshot makes no API call'
}


function Initialize-IntegrationMock {
    param([Parameter(Mandatory = $true)][string]$Subject)
    $script:MockCalls = 0
    $script:MockUris = @()
    $script:MockTimeouts = @()
    $script:MockPayloads = @()
    $script:MockAuthorization = ''
    $script:MockQueue = @()
    $script:MockStatus = 200
    $script:MockBody = New-TestResponseBody -Subject $Subject
    $script:MockRetryAfter = $null
    $script:MockTimedOut = $false
    $script:MockAdvanceSeconds = 0
    $script:MockNow = [DateTimeOffset]::UtcNow
    $script:MockCallback = $null
    $script:IntegrationNpmCalls = @()
}

function New-IntegrationGitPair {
    param(
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [Parameter(Mandatory = $true)][string]$Name,
        [switch]$NoRemote,
        [switch]$IncludeSensitivePath,
        [switch]$IncludeBenignLookalikePaths
    )
    $repoRoot = Join-Path $FixtureRoot ('integration ' + $Name + ' repo')
    $remoteRoot = Join-Path $FixtureRoot ('integration ' + $Name + ' bare remote.git')
    $null = New-Item -ItemType Directory -Path $repoRoot -Force
    Assert-SafeFixturePath -FixtureRoot $FixtureRoot -Candidate $repoRoot
    if (-not $NoRemote) {
        $null = New-Item -ItemType Directory -Path $remoteRoot -Force
        Assert-SafeFixturePath -FixtureRoot $FixtureRoot -Candidate $remoteRoot
        Invoke-TestGit -RepositoryRoot $FixtureRoot -Arguments @('init', '--quiet', '--bare', $remoteRoot) | Out-Null
        $null = Invoke-TestGit -RepositoryRoot $FixtureRoot -Arguments @('-C', $repoRoot, 'init', '--quiet', '-b', 'main')
    }
    else {
        $null = Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('init', '--quiet', '-b', 'main')
    }

    Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('config', 'user.name', 'Tray Fixture') | Out-Null
    Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('config', 'user.email', 'tray-fixture@example.invalid') | Out-Null
    Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('config', 'commit.gpgsign', 'false') | Out-Null
    Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('config', 'core.hooksPath', (Join-Path $FixtureRoot 'empty hooks')) | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $repoRoot 'README.md'), ('Base docs.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText((Join-Path $repoRoot 'notes.md'), ('Base notes.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
    if ($IncludeSensitivePath) {
        [System.IO.File]::WriteAllText((Join-Path $repoRoot '.env.production'), 'Synthetic test fixture content only.', [System.Text.Encoding]::UTF8)
    }
    if ($IncludeBenignLookalikePaths) {
        $sourceDirectory = Join-Path $repoRoot 'netlify\functions'
        $fixtureDirectory = Join-Path $repoRoot 'tests\fixtures'
        $null = New-Item -ItemType Directory -Path $sourceDirectory, $fixtureDirectory -Force
        [System.IO.File]::WriteAllText((Join-Path $sourceDirectory 'google-token.js'), 'export const handler = () => "fixture";' + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText((Join-Path $fixtureDirectory 'settings.json'), '{"data":{}}' + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
    }
    Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('add', '--all', '--', '.') | Out-Null
    Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('commit', '--quiet', '-m', 'Fixture base') | Out-Null
    if (-not $NoRemote) {
        Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('remote', 'add', 'origin', $remoteRoot) | Out-Null
        Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('push', '--quiet', '--set-upstream', 'origin', 'main') | Out-Null
        Assert-LocalFixtureRemote -FixtureRoot $FixtureRoot -RemoteUrl $remoteRoot
    }
    $head = Invoke-TestGit -RepositoryRoot $repoRoot -Arguments @('rev-parse', 'HEAD')
    return [pscustomobject]@{ RepositoryRoot = $repoRoot; RemoteRoot = $(if ($NoRemote) { '' } else { $remoteRoot }); BaseHead = $head }
}

function Assert-LocalFixtureRemote {
    param(
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [Parameter(Mandatory = $true)][string]$RemoteUrl
    )
    if ($RemoteUrl -match '^(?i)(?:https?|ssh|git)://|^[^/\\]+@[^:]+:') {
        throw 'The test harness refuses non-local Git remotes.'
    }
    $remotePath = [System.IO.Path]::GetFullPath($RemoteUrl)
    Assert-SafeFixturePath -FixtureRoot $FixtureRoot -Candidate $remotePath
    if (-not (Test-Path -LiteralPath $remotePath -PathType Container)) {
        throw 'The test harness requires an existing local bare remote.'
    }
    $bare = Invoke-TestGit -RepositoryRoot $remotePath -Arguments @('rev-parse', '--is-bare-repository')
    if ($bare.Trim() -ne 'true') {
        throw 'The test harness requires an existing local bare remote.'
    }
}

function Get-IntegrationRemoteHead {
    param([Parameter(Mandatory = $true)][string]$RemoteRoot)
    if ([string]::IsNullOrWhiteSpace($RemoteRoot)) { return '' }
    $output = & git -C $RemoteRoot rev-parse refs/heads/main 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    return ([string]$output).Trim()
}

function Invoke-IntegrationNpmRunner {
    param([string]$ScriptName, [string]$RepositoryRoot)
    $script:IntegrationNpmCalls += $ScriptName
    return 0
}

function Invoke-IntegrationWorkflow {
    param(
        [Parameter(Mandatory = $true)][object]$Pair,
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [scriptblock]$ResponseTransport,
        [scriptblock]$NpmRunner,
        [scriptblock]$BeforeCommit,
        [AllowNull()][string]$Note
    )
    if ($null -eq $ResponseTransport) { $ResponseTransport = Get-TestMockTransport }
    if ($null -eq $NpmRunner) { $NpmRunner = { param($ScriptName, $RepositoryRoot) Invoke-IntegrationNpmRunner -ScriptName $ScriptName -RepositoryRoot $RepositoryRoot } }
    $settings = [pscustomobject]@{ AiSubjectsEnabled = $true }
    $settingsRoot = Join-Path $FixtureRoot 'synthetic local settings'
    $runDirectory = Join-Path $FixtureRoot ('run files ' + [guid]::NewGuid().ToString('N'))
    return Invoke-GitPushWorkflow -RepositoryRoot $Pair.RepositoryRoot -RunDirectory $runDirectory -SettingsRoot $settingsRoot -SettingsOverride $settings -ApiKeyOverride $script:IntegrationSecureKey -ResponseTransport $ResponseTransport -NpmRunner $NpmRunner -BeforeCommit $BeforeCommit -ChangeNote $Note
}

function Get-TestGitBashPath {
    $gitPath = (Get-Command git -ErrorAction Stop).Source
    $gitDirectory = Split-Path -Parent $gitPath
    $gitRoot = Split-Path -Parent $gitDirectory
    foreach ($candidate in @((Join-Path $gitRoot 'bin\bash.exe'), (Join-Path $gitRoot 'usr\bin\bash.exe'))) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $bashCommand = Get-Command bash -ErrorAction SilentlyContinue
    if ($null -ne $bashCommand) { return $bashCommand.Source }
    throw 'The existing Git for Windows Bash runtime is required to create isolated hook fixtures.'
}

function Install-TestGitHook {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$HookName,
        [Parameter(Mandatory = $true)][string]$Contents,
        [Parameter(Mandatory = $true)][string]$FixtureRoot
    )
    $hookDirectory = Join-Path $FixtureRoot ('hooks-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $hookDirectory -Force
    Assert-SafeFixturePath -FixtureRoot $FixtureRoot -Candidate $hookDirectory
    $hookPath = Join-Path $hookDirectory $HookName
    $normalizedContents = [regex]::Replace($Contents, '\r\n?', [string][char]10)
    [System.IO.File]::WriteAllText($hookPath, $normalizedContents, (New-Object System.Text.UTF8Encoding($false)))
    $bashPath = Get-TestGitBashPath
    $bashCommand = 'chmod +x ' + $hookPath.Replace('\', '/')
    & $bashPath --noprofile -c $bashCommand
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the isolated Git hook fixture.' }
    Invoke-TestGit -RepositoryRoot $RepositoryRoot -Arguments @('config', 'core.hooksPath', $hookDirectory) | Out-Null
    return $hookDirectory
}

function Invoke-IgnorePolicyAssertions {
    $privatePaths = @(
        '.env', '.env.production', '.envrc', 'nested/.env.production', 'openai-key.dpapi',
        'openai-key.dpapi.bak', 'ahk-tray-tools/openai-key.dpapi',
        'ahk-tray-tools/settings.json', 'ahk-tray-tools/settings.json.bak',
        'ahk-tray-tools/tray-git-sync.local/key-backup.txt', 'tray-git-sync.local/key-backup.txt'
    )
    foreach ($path in $privatePaths) {
        Assert-True -Condition (Test-IgnorePath -Path $path) -Message ('private path is ignored: ' + $path)
    }
    $visibleScripts = @(
        'ahk-tray-tools/PushLocalToGit.ps1',
        'ahk-tray-tools/GitPushSupport.ps1',
        'ahk-tray-tools/ConfigureGitPush.ps1',
        'tests/tray-git-sync.test.ps1'
    )
    foreach ($path in $visibleScripts) {
        Assert-False -Condition (Test-IgnorePath -Path $path) -Message ('source script is visible through the PowerShell ignore rule: ' + $path)
    }
}

function Invoke-IntegrationPhase {
    param([Parameter(Mandatory = $true)][string]$FixtureRoot)

    $environmentNames = @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES')
    $savedEnvironment = @{}
    foreach ($name in $environmentNames) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    $script:IntegrationSecureKey = $null
    try {
        $helperOutput = . $script:HelperPath
        Assert-Equal -Expected 0 -Actual @($helperOutput).Count -Message 'integration helper dot-sourcing emits no output'
        $script:IntegrationSecureKey = ConvertTo-GitPushSecureString -Text ('sk-proj-' + ('t' * 32))
        Assert-Throws -Action { Assert-SafeFixturePath -FixtureRoot $FixtureRoot -Candidate $script:RepositoryRoot } -Message 'integration harness refuses the production repository'
        Assert-Throws -Action { Assert-LocalFixtureRemote -FixtureRoot $FixtureRoot -RemoteUrl 'https://example.invalid/repo.git' } -Message 'integration harness refuses a non-local remote'
        Invoke-IgnorePolicyAssertions

        $importOutput = . $script:ControllerPath
        Assert-Equal -Expected 0 -Actual @($importOutput).Count -Message 'controller dot-sourcing emits no workflow output'

        $successPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'commit and push'
        Initialize-IntegrationMock -Subject 'Clarify setup guidance'
        $successPath = Join-Path $successPair.RepositoryRoot 'README.md'
        [System.IO.File]::WriteAllText($successPath, ('Clarifies setup and usage.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        $script:IntegrationNpmCalls = @()
        $success = Invoke-IntegrationWorkflow -Pair $successPair -FixtureRoot $FixtureRoot -Note 'Clarify root installation guidance'
        Assert-True -Condition $success.Success -Message ('staged changes commit and push to the local bare remote: ' + $success.Status)
        Assert-Equal -Expected 1 -Actual $success.RequestCount -Message 'commit-and-push uses one synthetic API request'
        Assert-Equal -Expected 1 -Actual $script:MockCalls -Message 'commit-and-push calls only the mocked transport'
        Assert-Equal -Expected $success.CommitSha -Actual (Get-IntegrationRemoteHead -RemoteRoot $successPair.RemoteRoot) -Message 'the exact verified commit reaches the local destination'
        Assert-Equal -Expected $successPair.BaseHead -Actual (Invoke-TestGit -RepositoryRoot $successPair.RepositoryRoot -Arguments @('rev-parse', 'HEAD^')) -Message 'new commit has the captured HEAD as its parent'
        $commitRaw = Get-GitPushCommitRaw -RepositoryRoot $successPair.RepositoryRoot -CommitSha $success.CommitSha
        $commitSeparator = ([string][char]10) + ([string][char]10)
        $commitMessage = $commitRaw.Substring($commitRaw.IndexOf($commitSeparator, [System.StringComparison]::Ordinal) + 2)
        Assert-Equal -Expected ('Clarify setup guidance' + [string][char]10) -Actual $commitMessage -Message 'commit message has exactly one subject and no body or trailer'
        Assert-True -Condition (Test-GitPushCommitSubject -Subject $success.Subject) -Message 'committed subject satisfies the 52-character contract'
        Assert-Equal -Expected 2 -Actual $script:IntegrationNpmCalls.Count -Message 'both normalizer and staged repair run before snapshot'
        Assert-Equal -Expected 'format:text' -Actual $script:IntegrationNpmCalls[0] -Message 'normalization runs first'
        Assert-Equal -Expected 'repair:text:staged' -Actual $script:IntegrationNpmCalls[1] -Message 'staged repair runs second'
        $successPayload = ConvertFrom-Json -InputObject $script:MockPayloads[0]
        $successEvidence = ConvertFrom-Json -InputObject $successPayload.input[0].content[0].text
        Assert-Equal -Expected 'Clarify root installation guidance' -Actual $successEvidence.note -Message 'one-run note is included as bounded synthetic context'
        $successLog = Get-Content -LiteralPath $success.LogPath -Raw
        Assert-False -Condition ($successLog.Contains('sk-proj-')) -Message 'run log contains no key material'
        Assert-False -Condition ($successLog.Contains('Authorization')) -Message 'run log contains no authorization header'
        Assert-Equal -Expected 0 -Actual (Get-GitPushWorkingTreeStatus -RepositoryRoot $successPair.RepositoryRoot).Length -Message 'clean successful push reports a clean tree'

        $cleanPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'clean existing head'
        Initialize-IntegrationMock -Subject 'Should not be requested'
        $clean = Invoke-IntegrationWorkflow -Pair $cleanPair -FixtureRoot $FixtureRoot
        Assert-True -Condition $clean.Success -Message 'clean repository pushes its existing commit'
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'clean repository makes zero API calls'
        Assert-Equal -Expected $cleanPair.BaseHead -Actual $clean.CommitSha -Message 'clean repository sends the existing HEAD'
        Assert-Equal -Expected $cleanPair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $cleanPair.RemoteRoot) -Message 'clean repository leaves the remote at the existing commit'

        $lookalikePair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'benign protected-name paths' -IncludeBenignLookalikePaths
        $lookalikePathsText = Invoke-TestGit -RepositoryRoot $lookalikePair.RepositoryRoot -Arguments @('ls-files')
        $lookalikePaths = @($lookalikePathsText -split '\r?\n' | Where-Object { $_ })
        Assert-True -Condition ($lookalikePaths -contains 'netlify/functions/google-token.js') -Message 'integration fixture tracks token-named source code'
        Assert-True -Condition ($lookalikePaths -contains 'tests/fixtures/settings.json') -Message 'integration fixture tracks a settings JSON fixture'
        Initialize-IntegrationMock -Subject 'Should not be requested'
        $lookalike = Invoke-IntegrationWorkflow -Pair $lookalikePair -FixtureRoot $FixtureRoot
        Assert-True -Condition $lookalike.Success -Message ('clean push allows benign source and fixture paths: ' + $lookalike.Status)
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'benign tracked paths do not request an AI subject on a clean push'
        Assert-Equal -Expected $lookalikePair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $lookalikePair.RemoteRoot) -Message 'benign tracked paths push the existing commit to the local remote'

        $fallbackPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'missing upstream'
        Invoke-TestGit -RepositoryRoot $fallbackPair.RepositoryRoot -Arguments @('config', '--unset', 'branch.main.remote') | Out-Null
        Invoke-TestGit -RepositoryRoot $fallbackPair.RepositoryRoot -Arguments @('config', '--unset', 'branch.main.merge') | Out-Null
        [System.IO.File]::AppendAllText((Join-Path $fallbackPair.RepositoryRoot 'README.md'), ('Fallback push.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Initialize-IntegrationMock -Subject 'Refresh setup notes'
        $fallback = Invoke-IntegrationWorkflow -Pair $fallbackPair -FixtureRoot $FixtureRoot
        Assert-True -Condition $fallback.Success -Message ('missing upstream falls back to origin and branch: ' + $fallback.Status)
        Assert-Equal -Expected $fallback.CommitSha -Actual (Get-IntegrationRemoteHead -RemoteRoot $fallbackPair.RemoteRoot) -Message 'fallback push updates the local origin branch'
        Assert-Equal -Expected 'origin' -Actual (Invoke-TestGit -RepositoryRoot $fallbackPair.RepositoryRoot -Arguments @('config', '--get', 'branch.main.remote')) -Message '--set-upstream restores the origin tracking remote'
        Assert-Equal -Expected 'refs/heads/main' -Actual (Invoke-TestGit -RepositoryRoot $fallbackPair.RepositoryRoot -Arguments @('config', '--get', 'branch.main.merge')) -Message '--set-upstream restores the target branch'

        $noRemotePair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'no origin' -NoRemote
        [System.IO.File]::AppendAllText((Join-Path $noRemotePair.RepositoryRoot 'README.md'), ('No remote change.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Initialize-IntegrationMock -Subject 'Should not run without a remote'
        $noRemote = Invoke-IntegrationWorkflow -Pair $noRemotePair -FixtureRoot $FixtureRoot
        Assert-False -Condition $noRemote.Success -Message 'missing origin stops in preflight'
        Assert-True -Condition ($noRemote.Status -match 'configure the branch upstream') -Message 'missing origin status describes the safe fix'
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'missing origin stops before API transport'
        Assert-Equal -Expected 0 -Actual $script:IntegrationNpmCalls.Count -Message 'missing origin stops before normalization'
        Assert-Equal -Expected $noRemotePair.BaseHead -Actual (Invoke-TestGit -RepositoryRoot $noRemotePair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')) -Message 'missing origin creates no commit'

        $detachedPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'detached head'
        Invoke-TestGit -RepositoryRoot $detachedPair.RepositoryRoot -Arguments @('checkout', '--quiet', '--detach', 'HEAD') | Out-Null
        [System.IO.File]::AppendAllText((Join-Path $detachedPair.RepositoryRoot 'README.md'), ('Detached edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Initialize-IntegrationMock -Subject 'Should not run detached'
        $detached = Invoke-IntegrationWorkflow -Pair $detachedPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $detached.Success -Message 'detached HEAD stops in preflight'
        Assert-True -Condition ($detached.Status -match 'check out a branch') -Message 'detached HEAD status describes the safe fix'
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'detached HEAD stops before API transport'
        Assert-Equal -Expected 0 -Actual $script:IntegrationNpmCalls.Count -Message 'detached HEAD stops before normalization'

        $unmergedPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'unmerged state'
        Invoke-TestGit -RepositoryRoot $unmergedPair.RepositoryRoot -Arguments @('checkout', '--quiet', '-b', 'topic') | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $unmergedPair.RepositoryRoot 'README.md'), ('Topic docs.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Invoke-TestGit -RepositoryRoot $unmergedPair.RepositoryRoot -Arguments @('commit', '--all', '--quiet', '-m', 'Topic edit') | Out-Null
        Invoke-TestGit -RepositoryRoot $unmergedPair.RepositoryRoot -Arguments @('checkout', '--quiet', 'main') | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $unmergedPair.RepositoryRoot 'README.md'), ('Main docs.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Invoke-TestGit -RepositoryRoot $unmergedPair.RepositoryRoot -Arguments @('commit', '--all', '--quiet', '-m', 'Main edit') | Out-Null
        & git -C $unmergedPair.RepositoryRoot merge --quiet topic 2>&1 | Out-Null
        $mergeExitCode = $LASTEXITCODE
        Assert-Equal -Expected 1 -Actual $mergeExitCode -Message 'fixture creates a genuine unresolved merge'
        Initialize-IntegrationMock -Subject 'Should not run in merge'
        $unmerged = Invoke-IntegrationWorkflow -Pair $unmergedPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $unmerged.Success -Message 'unresolved merge stops in preflight'
        Assert-True -Condition ($unmerged.Status -match 'resolve the unmerged paths|finish or abort the active Git operation') -Message 'unresolved operation status describes the safe fix'
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'unresolved merge stops before API transport'
        Assert-Equal -Expected 0 -Actual $script:IntegrationNpmCalls.Count -Message 'unresolved merge stops before normalization'

        $duplicatePair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'duplicate worker'
        [System.IO.File]::AppendAllText((Join-Path $duplicatePair.RepositoryRoot 'README.md'), ('Duplicate edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        $duplicateRun = Join-Path $FixtureRoot 'duplicate guarded run'
        $null = New-Item -ItemType Directory -Path $duplicateRun -Force
        $duplicateStatus = Join-Path $duplicateRun 'git-sync-status.txt'
        $duplicateLog = Join-Path $duplicateRun 'git-sync.log'
        [System.IO.File]::WriteAllText($duplicateStatus, 'STEP|sentinel status', [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText($duplicateLog, 'sentinel log', [System.Text.Encoding]::UTF8)
        $duplicateRepoId = Get-GitPushRepoId -RepositoryRoot $duplicatePair.RepositoryRoot
        $duplicateMutex = New-Object System.Threading.Mutex($false, ('Local\CGCSP_TrayGitSync_' + $duplicateRepoId))
        $duplicateOwnsMutex = $false
        $duplicateJob = $null
        try {
            $duplicateOwnsMutex = $duplicateMutex.WaitOne(0)
            Assert-True -Condition $duplicateOwnsMutex -Message 'fixture acquires the repository mutex'
            $duplicateJob = Start-Job -ScriptBlock {
                param($ControllerPath, $RepositoryRoot, $RunDirectory)
                . $ControllerPath
                $answer = Invoke-GitPushWorkflow -RepositoryRoot $RepositoryRoot -RunDirectory $RunDirectory
                ConvertTo-Json -InputObject $answer -Compress
            } -ArgumentList $script:ControllerPath, $duplicatePair.RepositoryRoot, $duplicateRun
            $completedJob = Wait-Job -Job $duplicateJob -Timeout 30
            Assert-True -Condition ($null -ne $completedJob) -Message 'duplicate workflow exits promptly while another worker owns the lock'
            $duplicateJson = [string](Receive-Job -Job $duplicateJob)
            $duplicateResult = ConvertFrom-Json -InputObject $duplicateJson
            Assert-True -Condition $duplicateResult.Busy -Message 'duplicate workflow reports busy without changing run state'
            Assert-Equal -Expected 'STEP|sentinel status' -Actual (Get-Content -LiteralPath $duplicateStatus -Raw).Trim() -Message 'duplicate worker does not overwrite active status'
            Assert-Equal -Expected 'sentinel log' -Actual (Get-Content -LiteralPath $duplicateLog -Raw).Trim() -Message 'duplicate worker does not overwrite active log'
        }
        finally {
            if ($null -ne $duplicateJob) { Remove-Job -Job $duplicateJob -Force -ErrorAction SilentlyContinue }
            if ($duplicateOwnsMutex) { $duplicateMutex.ReleaseMutex() }
            $duplicateMutex.Dispose()
        }

        $indexDriftPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'index drift'
        [System.IO.File]::AppendAllText((Join-Path $indexDriftPair.RepositoryRoot 'README.md'), ('Initial staged edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Initialize-IntegrationMock -Subject 'Describe indexed change'
        $script:MockCallback = {
            param($Uri, $Headers, $BodyBytes, $TimeoutSeconds)
            [System.IO.File]::AppendAllText((Join-Path $indexDriftPair.RepositoryRoot 'README.md'), ('Staged during transport.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
            Invoke-TestGit -RepositoryRoot $indexDriftPair.RepositoryRoot -Arguments @('add', 'README.md') | Out-Null
        }.GetNewClosure()
        $indexDrift = Invoke-IntegrationWorkflow -Pair $indexDriftPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $indexDrift.Success -Message 'index drift during mocked API generation stops the workflow'
        Assert-Equal -Expected 1 -Actual $script:MockCalls -Message 'index drift is detected after the mocked response returns'
        Assert-Equal -Expected $indexDriftPair.BaseHead -Actual (Invoke-TestGit -RepositoryRoot $indexDriftPair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')) -Message 'index drift creates no tray commit'
        Assert-Equal -Expected $indexDriftPair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $indexDriftPair.RemoteRoot) -Message 'index drift creates no remote update'

        $headDriftPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'head drift'
        [System.IO.File]::AppendAllText((Join-Path $headDriftPair.RepositoryRoot 'README.md'), ('Staged edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Initialize-IntegrationMock -Subject 'Describe staged change'
        $script:MockCallback = {
            param($Uri, $Headers, $BodyBytes, $TimeoutSeconds)
            $baseHead = Invoke-TestGit -RepositoryRoot $headDriftPair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')
            $baseTree = Invoke-TestGit -RepositoryRoot $headDriftPair.RepositoryRoot -Arguments @('rev-parse', 'HEAD^{tree}')
            $externalHead = Invoke-TestGit -RepositoryRoot $headDriftPair.RepositoryRoot -Arguments @('commit-tree', $baseTree, '-p', $baseHead, '-m', 'External head move')
            Invoke-TestGit -RepositoryRoot $headDriftPair.RepositoryRoot -Arguments @('update-ref', 'refs/heads/main', $externalHead) | Out-Null
        }.GetNewClosure()
        $headDrift = Invoke-IntegrationWorkflow -Pair $headDriftPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $headDrift.Success -Message 'HEAD drift during mocked API generation stops the workflow'
        Assert-Equal -Expected 1 -Actual $script:MockCalls -Message 'HEAD drift is detected after the mocked response returns'
        Assert-Equal -Expected $headDriftPair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $headDriftPair.RemoteRoot) -Message 'HEAD drift creates no remote update'
        Assert-True -Condition ((Invoke-TestGit -RepositoryRoot $headDriftPair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')) -ne $headDriftPair.BaseHead) -Message 'external HEAD movement is preserved'

        $mutatingHookPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'mutating hook'
        [System.IO.File]::AppendAllText((Join-Path $mutatingHookPair.RepositoryRoot 'README.md'), ('Hook test edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        $mutatingHook = @'
#!/bin/sh
printf '\nFixture hook added a body' >> "$1"
'@
        $null = Install-TestGitHook -RepositoryRoot $mutatingHookPair.RepositoryRoot -HookName 'commit-msg' -Contents $mutatingHook -FixtureRoot $FixtureRoot
        Initialize-IntegrationMock -Subject 'Describe hook test'
        $mutatingResult = Invoke-IntegrationWorkflow -Pair $mutatingHookPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $mutatingResult.Success -Message 'message-changing commit hook is detected'
        Assert-True -Condition ($mutatingResult.CommitSha -ne $mutatingHookPair.BaseHead) -Message 'hook-mutated local commit is preserved for recovery'
        Assert-Equal -Expected $mutatingHookPair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $mutatingHookPair.RemoteRoot) -Message 'hook-mutated commit is never pushed'
        Assert-True -Condition ($mutatingResult.Status -match 'preserved') -Message 'hook mutation status describes the retained local commit'

        $failingHookPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'failing hook'
        [System.IO.File]::AppendAllText((Join-Path $failingHookPair.RepositoryRoot 'README.md'), ('Failing hook edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        $failingHook = @'
#!/bin/sh
exit 1
'@
        $null = Install-TestGitHook -RepositoryRoot $failingHookPair.RepositoryRoot -HookName 'pre-commit' -Contents $failingHook -FixtureRoot $FixtureRoot
        Initialize-IntegrationMock -Subject 'Describe hook failure'
        $failingResult = Invoke-IntegrationWorkflow -Pair $failingHookPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $failingResult.Success -Message 'failing ordinary hook stops commit'
        Assert-Equal -Expected $failingHookPair.BaseHead -Actual (Invoke-TestGit -RepositoryRoot $failingHookPair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')) -Message 'failing hook creates no local commit'
        Assert-Equal -Expected $failingHookPair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $failingHookPair.RemoteRoot) -Message 'failing hook creates no remote update'

        $rejectedPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'rejected push'
        [System.IO.File]::AppendAllText((Join-Path $rejectedPair.RepositoryRoot 'README.md'), ('Rejected push edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        $rejectingHook = @'
#!/bin/sh
exit 1
'@
        $null = Install-TestGitHook -RepositoryRoot $rejectedPair.RemoteRoot -HookName 'pre-receive' -Contents $rejectingHook -FixtureRoot $FixtureRoot
        Initialize-IntegrationMock -Subject 'Describe rejected change'
        $rejected = Invoke-IntegrationWorkflow -Pair $rejectedPair -FixtureRoot $FixtureRoot
        Assert-False -Condition $rejected.Success -Message 'bare remote rejection is reported as a failed push'
        Assert-True -Condition ($rejected.CommitSha -ne $rejectedPair.BaseHead) -Message 'rejected push preserves the verified local commit'
        Assert-Equal -Expected $rejectedPair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $rejectedPair.RemoteRoot) -Message 'rejected push leaves the remote unchanged'
        Assert-True -Condition ($rejected.Status -match 'preserved') -Message 'rejected push status explains local commit recovery'

        $newerEditPair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'newer worktree edit'
        [System.IO.File]::AppendAllText((Join-Path $newerEditPair.RepositoryRoot 'README.md'), ('Staged snapshot edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Initialize-IntegrationMock -Subject 'Clarify staged documentation'
        $script:MockCallback = {
            param($Uri, $Headers, $BodyBytes, $TimeoutSeconds)
            [System.IO.File]::WriteAllText((Join-Path $newerEditPair.RepositoryRoot 'notes.md'), ('Newer unstaged edit.' + [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        }.GetNewClosure()
        $newerEdit = Invoke-IntegrationWorkflow -Pair $newerEditPair -FixtureRoot $FixtureRoot
        Assert-True -Condition $newerEdit.Success -Message 'newer unstaged edits do not prevent the captured snapshot push'
        Assert-True -Condition ($newerEdit.Status -match 'newer local edits remain') -Message 'success status accurately identifies newer worktree edits'
        Assert-Equal -Expected 'Base notes.' -Actual (Invoke-TestGit -RepositoryRoot $newerEditPair.RepositoryRoot -Arguments @('show', 'HEAD:notes.md')).Trim() -Message 'newer unstaged content is not included in the captured commit'
        Assert-Equal -Expected 'Newer unstaged edit.' -Actual (Get-Content -LiteralPath (Join-Path $newerEditPair.RepositoryRoot 'notes.md') -Raw).Trim() -Message 'newer unstaged content remains in the worktree'
        Assert-Equal -Expected $newerEdit.CommitSha -Actual (Get-IntegrationRemoteHead -RemoteRoot $newerEditPair.RemoteRoot) -Message 'only the captured commit is sent'

        $stagedSensitivePair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'force-staged private path'
        [System.IO.File]::WriteAllText((Join-Path $stagedSensitivePair.RepositoryRoot '.env.production'), 'Synthetic fixture marker, not a credential.', [System.Text.Encoding]::UTF8)
        Invoke-TestGit -RepositoryRoot $stagedSensitivePair.RepositoryRoot -Arguments @('add', '--force', '.env.production') | Out-Null
        Initialize-IntegrationMock -Subject 'Must not describe a private path'
        $stagedSensitive = Invoke-IntegrationWorkflow -Pair $stagedSensitivePair -FixtureRoot $FixtureRoot
        Assert-False -Condition $stagedSensitive.Success -Message 'force-staged private path stops before commit'
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'force-staged private path stops before API transport'
        Assert-True -Condition ($stagedSensitive.Status.Contains('.env.production')) -Message 'private path failure reports only the blocked filename'
        Assert-False -Condition ($stagedSensitive.Status.Contains('Synthetic fixture marker')) -Message 'private-path status does not expose file contents'
        Assert-Equal -Expected $stagedSensitivePair.BaseHead -Actual (Invoke-TestGit -RepositoryRoot $stagedSensitivePair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')) -Message 'force-staged private path creates no commit'
        Assert-Equal -Expected $stagedSensitivePair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $stagedSensitivePair.RemoteRoot) -Message 'force-staged private path creates no push'

        $trackedSensitivePair = New-IntegrationGitPair -FixtureRoot $FixtureRoot -Name 'tracked private path' -IncludeSensitivePath
        Initialize-IntegrationMock -Subject 'Must not describe a tracked private path'
        $trackedSensitive = Invoke-IntegrationWorkflow -Pair $trackedSensitivePair -FixtureRoot $FixtureRoot
        Assert-False -Condition $trackedSensitive.Success -Message 'pre-tracked private path stops in preflight'
        Assert-Equal -Expected 0 -Actual $script:MockCalls -Message 'pre-tracked private path stops before API transport'
        Assert-True -Condition ($trackedSensitive.Status.Contains('.env.production')) -Message 'tracked private path failure reports only the blocked filename'
        Assert-False -Condition ($trackedSensitive.Status.Contains('Synthetic test fixture content only.')) -Message 'tracked-private status does not expose file contents'
        Assert-Equal -Expected $trackedSensitivePair.BaseHead -Actual (Invoke-TestGit -RepositoryRoot $trackedSensitivePair.RepositoryRoot -Arguments @('rev-parse', 'HEAD')) -Message 'pre-tracked private path creates no commit'
        Assert-Equal -Expected $trackedSensitivePair.BaseHead -Actual (Get-IntegrationRemoteHead -RemoteRoot $trackedSensitivePair.RemoteRoot) -Message 'pre-tracked private path creates no push'
    }
    finally {
        if ($null -ne $script:IntegrationSecureKey) {
            $script:IntegrationSecureKey.Dispose()
            $script:IntegrationSecureKey = $null
        }
        foreach ($name in $environmentNames) {
            [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
        }
    }
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $tempBase ('cgcsp-tray-git-sync-' + [guid]::NewGuid().ToString('N'))
Assert-SafeFixturePath -FixtureRoot $tempBase -Candidate $fixtureRoot
if ($fixtureRoot.StartsWith(($script:RepositoryRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The test harness refuses to create fixtures under the production repository.'
}
$null = New-Item -ItemType Directory -Path $fixtureRoot -Force

try {
    if ($Phase -eq 'Unit' -or $Phase -eq 'All') {
        Invoke-UnitPhase -FixtureRoot $fixtureRoot
    }
    if ($Phase -eq 'Integration' -or $Phase -eq 'All') {
        Invoke-IntegrationPhase -FixtureRoot $fixtureRoot
    }
}
finally {
    $fullTemp = [System.IO.Path]::GetFullPath($tempBase).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $fullFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    if ($fullFixture.StartsWith($fullTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
        $fullFixture -notlike ($script:RepositoryRoot.TrimEnd('\', '/') + '\*') -and
        (Split-Path -Leaf $fullFixture) -like 'cgcsp-tray-git-sync-*') {
        Remove-Item -LiteralPath $fullFixture -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Output ('PASS: ' + $script:AssertionCount + ' tray Git sync assertions (' + $Phase + ').')
