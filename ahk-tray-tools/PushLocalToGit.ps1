param(
    [switch]$RunWorkflow,
    [switch]$WithChangeNote
)

. (Join-Path $PSScriptRoot 'GitPushSupport.ps1')

function Get-GitPushCommandResult {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int[]]$AllowedExitCodes = @(0),
        [AllowNull()][string]$InputText
    )
    $result = Invoke-GitPushCommand -RepositoryRoot $RepositoryRoot -Arguments $Arguments -InputText $InputText
    if ($AllowedExitCodes -notcontains [int]$result.ExitCode) {
        throw 'Git command failed.'
    }
    return $result
}

function Write-GitPushRunStatus {
    param([string]$Path, [string]$State, [string]$Message)
    $parent = Split-Path -Parent $Path
    $encoding = New-Object System.Text.UTF8Encoding($false)
    for ($attempt = 1; $attempt -le 10; $attempt += 1) {
        $temporaryPath = $Path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
        try {
            if (-not [System.IO.Directory]::Exists($parent)) {
                [void][System.IO.Directory]::CreateDirectory($parent)
            }
            [System.IO.File]::WriteAllText($temporaryPath, ($State + '|' + $Message + [Environment]::NewLine), $encoding)
            Move-Item -LiteralPath $temporaryPath -Destination $Path -Force -ErrorAction Stop
            return
        }
        catch [System.IO.IOException] {
            if ($attempt -ge 10) { throw }
            Start-Sleep -Milliseconds (100 * $attempt)
        }
        finally {
            if ([System.IO.File]::Exists($temporaryPath)) {
                [System.IO.File]::Delete($temporaryPath)
            }
        }
    }
}

function Add-GitPushRunLog {
    param([string]$Path, [string]$Message)
    $parent = Split-Path -Parent $Path
    if (-not [System.IO.Directory]::Exists($parent)) {
        [void][System.IO.Directory]::CreateDirectory($parent)
    }
    $line = '[{0}] {1}{2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message, [Environment]::NewLine
    [System.IO.File]::AppendAllText($Path, $line, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-GitPushRunStep {
    param([string]$StatusPath, [string]$LogPath, [string]$Message)
    Write-GitPushRunStatus -Path $StatusPath -State 'STEP' -Message $Message
    Add-GitPushRunLog -Path $LogPath -Message $Message
}

function Get-GitPushTrackedAndStagedPaths {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)
    $tracked = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('ls-files', '-z')
    $staged = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'diff', '--cached', '--name-only', '--no-renames', '-z', '--diff-filter=ACDMRTUXB'
    )
    return @((Get-GitPushNulTokens -Text $tracked.Text) + (Get-GitPushNulTokens -Text $staged.Text))
}

function Assert-GitPushNoPrivateIndexPaths {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)
    $blockedPaths = New-Object 'System.Collections.Generic.List[string]'
    foreach ($path in @(Get-GitPushTrackedAndStagedPaths -RepositoryRoot $RepositoryRoot)) {
        $reason = Get-GitPushSensitivePathReason -Path ([string]$path)
        if (-not [string]::IsNullOrEmpty($reason)) {
            $safePath = ConvertTo-GitPushRedactedText -Text ([string]$path)
            $safePath = [regex]::Replace($safePath, '[\x00-\x1F\x7F|]', '?')
            $safePath = Limit-GitPushUtf8Text -Text $safePath -MaximumBytes 128 -Suffix '...'
            if ([string]::IsNullOrWhiteSpace($safePath)) { $safePath = '(protected path)' }
            if (-not $blockedPaths.Contains($safePath)) { [void]$blockedPaths.Add($safePath) }
        }
    }
    if ($blockedPaths.Count -gt 0) {
        $shownPaths = @($blockedPaths.ToArray() | Select-Object -First 6)
        if ($blockedPaths.Count -gt $shownPaths.Count) { $shownPaths += ('and ' + ($blockedPaths.Count - $shownPaths.Count) + ' more') }
        throw ('Blocked protected path(s), with filenames only: ' + [string]::Join(', ', $shownPaths))
    }
}

function Get-GitPushRepositorySnapshot {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$ExpectedRoot
    )
    $rootResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('rev-parse', '--show-toplevel')
    $actualRootText = ([string]$rootResult.Text).Trim()
    $actualRoot = [System.IO.Path]::GetFullPath($actualRootText).TrimEnd([char[]]@('\', '/'))
    $normalizedExpectedRoot = [System.IO.Path]::GetFullPath($ExpectedRoot).TrimEnd([char[]]@('\', '/'))
    if (-not $actualRoot.Equals($normalizedExpectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Git repository root does not match the tray project root.'
    }

    $branchResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('branch', '--show-current')
    $branch = ([string]$branchResult.Text).Trim()
    if ([string]::IsNullOrWhiteSpace($branch)) {
        throw 'Git requires an attached branch for tray push.'
    }

    $conflicts = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'diff', '--name-only', '--diff-filter=U', '-z'
    )
    if (@(Get-GitPushNulTokens -Text $conflicts.Text).Count -gt 0) {
        throw 'Git has unresolved index entries.'
    }

    foreach ($marker in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'BISECT_LOG')) {
        $markerResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('rev-parse', '--git-path', $marker)
        $markerPath = ([string]$markerResult.Text).Trim()
        if (-not [System.IO.Path]::IsPathRooted($markerPath)) {
            $markerPath = Join-Path $RepositoryRoot $markerPath
        }
        if (Test-Path -LiteralPath $markerPath) {
            throw 'Git has an operation in progress.'
        }
    }

    Assert-GitPushNoPrivateIndexPaths -RepositoryRoot $RepositoryRoot

    $headResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'rev-parse', '--verify', 'HEAD'
    ) -AllowedExitCodes @(0, 128)
    $head = ''
    if ($headResult.ExitCode -eq 0) {
        $head = ([string]$headResult.Text).Trim()
        $treeResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('rev-parse', 'HEAD^{tree}')
        $baseTree = ([string]$treeResult.Text).Trim()
    }
    else {
        $emptyTreeResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
            'hash-object', '-w', '-t', 'tree', '--stdin'
        ) -InputText ''
        $baseTree = ([string]$emptyTreeResult.Text).Trim()
    }

    $upstreamRemote = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'config', '--get', ('branch.' + $branch + '.remote')
    ) -AllowedExitCodes @(0, 1)
    $upstreamMerge = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'config', '--get', ('branch.' + $branch + '.merge')
    ) -AllowedExitCodes @(0, 1)
    $remote = ''
    $targetBranch = ''
    $hasUpstream = ($upstreamRemote.ExitCode -eq 0 -and $upstreamMerge.ExitCode -eq 0)
    if ($hasUpstream) {
        $remote = ([string]$upstreamRemote.Text).Trim()
        $mergeRef = ([string]$upstreamMerge.Text).Trim()
        if ($remote -eq '.' -or $mergeRef -notmatch '^refs/heads/(.+)$') {
            throw 'The configured upstream is not a remote branch.'
        }
        $targetBranch = $Matches[1]
    }
    else {
        $remote = 'origin'
        $targetBranch = $branch
    }

    $refResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'check-ref-format', ('refs/heads/' + $targetBranch)
    ) -AllowedExitCodes @(0, 1)
    if ($refResult.ExitCode -ne 0) {
        throw 'The push destination branch is invalid.'
    }
    $remoteUrl = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'remote', 'get-url', $remote
    ) -AllowedExitCodes @(0, 2)
    if ($remoteUrl.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace([string]$remoteUrl.Text)) {
        throw 'No configured push remote is available.'
    }
    $null = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'ls-remote', '--heads', $remote, ('refs/heads/' + $targetBranch)
    )
    return [pscustomobject]@{
        Root = $actualRoot
        Branch = $branch
        Head = $head
        BaseTree = $baseTree
        Remote = $remote
        TargetBranch = $targetBranch
        TargetRef = ('refs/heads/' + $targetBranch)
        HasUpstream = $hasUpstream
    }
}

function Get-GitPushIndexTree {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)
    $result = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('write-tree')
    return ([string]$result.Text).Trim()
}

function Get-GitPushWorkingTreeStatus {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)
    $result = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @(
        'status', '--porcelain=v1', '-z', '--untracked-files=all'
    )
    return ([string]$result.Text)
}

function Invoke-GitPushNpmScript {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [scriptblock]$NpmRunner
    )
    if ($null -ne $NpmRunner) {
        $runnerResult = & $NpmRunner $ScriptName $RepositoryRoot
        return [int]$runnerResult
    }
    Get-Command npm -ErrorAction Stop | Out-Null
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & npm --prefix $RepositoryRoot run $ScriptName 2>&1 | Out-Null
        return [int]$LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Get-GitPushCommitRaw {
    param([string]$RepositoryRoot, [string]$CommitSha)
    $result = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('cat-file', 'commit', $CommitSha)
    return [string]$result.Text
}

function Assert-GitPushVerifiedCommit {
    param(
        [string]$RepositoryRoot,
        [string]$ExpectedHead,
        [string]$ExpectedBranch,
        [string]$ExpectedParent,
        [string]$ExpectedTree,
        [string]$ExpectedSubject
    )
    $headResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('rev-parse', 'HEAD')
    $head = ([string]$headResult.Text).Trim()
    if ($head -ne $ExpectedHead) {
        throw 'The current branch moved during commit verification.'
    }
    $branchResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('branch', '--show-current')
    if (([string]$branchResult.Text).Trim() -ne $ExpectedBranch) {
        throw 'The current branch changed during commit verification.'
    }
    $treeResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('rev-parse', ($ExpectedHead + '^{tree}'))
    if (([string]$treeResult.Text).Trim() -ne $ExpectedTree) {
        throw 'The commit tree differs from the staged snapshot.'
    }
    $parentResult = Get-GitPushCommandResult -RepositoryRoot $RepositoryRoot -Arguments @('rev-list', '--parents', '-n', '1', $ExpectedHead)
    $parentFields = @(([string]$parentResult.Text).Trim() -split '\s+')
    if ($ExpectedParent) {
        if ($parentFields.Count -ne 2 -or $parentFields[1] -ne $ExpectedParent) {
            throw 'The commit does not have exactly the captured parent.'
        }
    }
    elseif ($parentFields.Count -ne 1) {
        throw 'The initial commit unexpectedly has a parent.'
    }

    $commitText = Get-GitPushCommitRaw -RepositoryRoot $RepositoryRoot -CommitSha $ExpectedHead
    $separator = ([string][char]10) + ([string][char]10)
    $separatorIndex = $commitText.IndexOf($separator, [System.StringComparison]::Ordinal)
    if ($separatorIndex -lt 0) {
        throw 'The commit message header is malformed.'
    }
    $message = $commitText.Substring($separatorIndex + 2)
    $expectedMessage = $ExpectedSubject + [string][char]10
    if (-not $message.Equals($expectedMessage, [System.StringComparison]::Ordinal)) {
        throw 'A Git hook changed or expanded the one-line commit message.'
    }
    if (-not (Test-GitPushCommitSubject -Subject $ExpectedSubject)) {
        throw 'The commit subject failed its local safety check.'
    }
}

function Show-GitPushChangeNoteDialog {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Push with change note'
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true
    $form.ClientSize = New-Object System.Drawing.Size(480, 218)
    $label = New-Object System.Windows.Forms.Label
    $label.Text = 'Add optional context for the commit subject. The staged changes remain authoritative.'
    $label.Location = New-Object System.Drawing.Point(16, 14)
    $label.Size = New-Object System.Drawing.Size(448, 40)
    $form.Controls.Add($label)
    $noteBox = New-Object System.Windows.Forms.TextBox
    $noteBox.Location = New-Object System.Drawing.Point(16, 58)
    $noteBox.Size = New-Object System.Drawing.Size(448, 98)
    $noteBox.Multiline = $true
    $noteBox.AcceptsReturn = $true
    $noteBox.MaxLength = 1000
    $form.Controls.Add($noteBox)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.Location = New-Object System.Drawing.Point(294, 172)
    $cancel.Size = New-Object System.Drawing.Size(78, 28)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancel)
    $continue = New-Object System.Windows.Forms.Button
    $continue.Text = 'Continue'
    $continue.Location = New-Object System.Drawing.Point(382, 172)
    $continue.Size = New-Object System.Drawing.Size(82, 28)
    $continue.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($continue)
    $form.AcceptButton = $continue
    $form.CancelButton = $cancel
    $dialogResult = $form.ShowDialog()
    $note = $noteBox.Text
    $form.Dispose()
    if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
        return [pscustomobject]@{ Accepted = $false; Note = '' }
    }
    return [pscustomobject]@{ Accepted = $true; Note = $note }
}

function Invoke-GitPushWorkflow {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [string]$RunDirectory,
        [string]$SettingsRoot,
        [switch]$PromptForChangeNote,
        [AllowNull()][string]$ChangeNote,
        [object]$SettingsOverride,
        [AllowNull()][System.Security.SecureString]$ApiKeyOverride,
        [scriptblock]$ResponseTransport,
        [scriptblock]$NpmRunner,
        [scriptblock]$BeforeCommit
    )
    $ErrorActionPreference = 'Stop'
    $canonicalRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
    if ([string]::IsNullOrWhiteSpace($RunDirectory)) {
        $RunDirectory = Join-Path $canonicalRoot '_temp-files\tray-git-sync'
    }
    $RunDirectory = [System.IO.Path]::GetFullPath($RunDirectory)
    $statusPath = Join-Path $RunDirectory 'git-sync-status.txt'
    $logPath = Join-Path $RunDirectory 'git-sync.log'
    $mutexName = 'Local\CGCSP_TrayGitSync_' + (Get-GitPushRepoId -RepositoryRoot $canonicalRoot)
    $mutex = $null
    $ownsMutex = $false
    $ownsApiKey = $false
    $apiKey = $null
    $selection = $null
    $commitSha = ''
    $commitCreated = $false
    $pushSucceeded = $false
    $phase = 'repository preflight'
    $messagePath = $null
    $lastMessage = ''

    try {
        $mutex = New-Object System.Threading.Mutex($false, $mutexName)
        try {
            $ownsMutex = $mutex.WaitOne(0)
        }
        catch [System.Threading.AbandonedMutexException] {
            $ownsMutex = $true
        }
        if (-not $ownsMutex) {
            return [pscustomobject]@{
                Success = $false; Busy = $true; Cancelled = $false; ExitCode = 0
                Status = 'Another tray Git push is already active.'; CommitSha = ''; Subject = ''
                StatusPath = $statusPath; LogPath = $logPath; RequestCount = 0
            }
        }

        [void][System.IO.Directory]::CreateDirectory($RunDirectory)
        Write-GitPushRunStatus -Path $statusPath -State 'STEP' -Message 'Starting local-to-git sync...'
        [System.IO.File]::WriteAllText($logPath, ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] Starting local-to-git sync.' + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))

        if ($PromptForChangeNote) {
            $phase = 'change note'
            $noteResult = Show-GitPushChangeNoteDialog
            if (-not $noteResult.Accepted) {
                $lastMessage = 'Push cancelled; no Git changes were made.'
                Write-GitPushRunStatus -Path $statusPath -State 'OK' -Message $lastMessage
                Add-GitPushRunLog -Path $logPath -Message $lastMessage
                return [pscustomobject]@{
                    Success = $true; Busy = $false; Cancelled = $true; ExitCode = 0
                    Status = $lastMessage; CommitSha = ''; Subject = ''; StatusPath = $statusPath
                    LogPath = $logPath; RequestCount = 0
                }
            }
            $ChangeNote = $noteResult.Note
        }
        $ChangeNote = ConvertTo-GitPushNote -Note $ChangeNote

        $phase = 'repository preflight'
        Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Checking repository, branch, and push destination...'
        $snapshot = Get-GitPushRepositorySnapshot -RepositoryRoot $canonicalRoot -ExpectedRoot $canonicalRoot
        $beforeStatus = Get-GitPushWorkingTreeStatus -RepositoryRoot $canonicalRoot

        if ($beforeStatus.Length -gt 0) {
            $phase = 'text normalization'
            Assert-GitPushNoPrivateIndexPaths -RepositoryRoot $canonicalRoot
            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Normalizing tracked text files...'
            if ((Invoke-GitPushNpmScript -RepositoryRoot $canonicalRoot -ScriptName 'format:text' -NpmRunner $NpmRunner) -ne 0) {
                throw 'Text normalization failed.'
            }

            $phase = 'staging'
            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Staging non-ignored local changes...'
            $null = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments @('add', '-A', '--', '.')
            Assert-GitPushNoPrivateIndexPaths -RepositoryRoot $canonicalRoot

            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Repairing staged text formatting...'
            if ((Invoke-GitPushNpmScript -RepositoryRoot $canonicalRoot -ScriptName 'repair:text:staged' -NpmRunner $NpmRunner) -ne 0) {
                throw 'Staged text repair failed.'
            }

            $null = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments @('add', '-A', '--', '.')
        }
        Assert-GitPushNoPrivateIndexPaths -RepositoryRoot $canonicalRoot
        $indexTree = Get-GitPushIndexTree -RepositoryRoot $canonicalRoot
        $hasNewCommit = ($indexTree -ne $snapshot.BaseTree)
        $subject = ''

        if ($hasNewCommit) {
            $phase = 'change evidence'
            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Capturing the staged snapshot...'
            $evidence = Get-GitPushStagedEvidence -RepositoryRoot $canonicalRoot -Branch $snapshot.Branch -BaseTree $snapshot.BaseTree -SnapshotTree $indexTree -Note $ChangeNote
            $phase = 'message generation'
            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Selecting a safe one-line commit subject...'

            $settings = $SettingsOverride
            if ($null -eq $settings) {
                try {
                    $settings = Get-GitPushSettings -RepositoryRoot $canonicalRoot -SettingsRoot $SettingsRoot
                }
                catch {
                    $settings = $null
                }
            }
            if ($null -ne $ApiKeyOverride) {
                $apiKey = $ApiKeyOverride
            }
            else {
                try {
                    $apiKey = Get-GitPushApiKey -RepositoryRoot $canonicalRoot -SettingsRoot $SettingsRoot
                    $ownsApiKey = ($null -ne $apiKey)
                }
                catch {
                    $apiKey = $null
                }
            }

            $selection = Get-GitPushCommitSubject -Evidence $evidence -Settings $settings -ApiKey $apiKey -ResponseTransport $ResponseTransport
            $subject = [string]$selection.Subject
            if (-not (Test-GitPushCommitSubject -Subject $subject)) {
                throw 'No safe commit subject was available.'
            }
            $lastMessage = $selection.SafeStatus + ' Subject: ' + $subject
            Write-GitPushRunStatus -Path $statusPath -State 'STEP' -Message $lastMessage
            Add-GitPushRunLog -Path $logPath -Message $lastMessage

            $phase = 'snapshot verification'
            if ($null -ne $BeforeCommit) {
                & $BeforeCommit $canonicalRoot $snapshot $indexTree
            }
            Assert-GitPushNoPrivateIndexPaths -RepositoryRoot $canonicalRoot
            $current = Get-GitPushRepositorySnapshot -RepositoryRoot $canonicalRoot -ExpectedRoot $canonicalRoot
            if ($current.Head -ne $snapshot.Head -or $current.Branch -ne $snapshot.Branch) {
                throw 'HEAD or branch changed while the subject was generated.'
            }
            $currentIndexTree = Get-GitPushIndexTree -RepositoryRoot $canonicalRoot
            if ($currentIndexTree -ne $indexTree) {
                throw 'The index changed while the subject was generated.'
            }

            $phase = 'commit'
            $messagePath = Join-Path $RunDirectory ('commit-message-' + [guid]::NewGuid().ToString('N') + '.txt')
            [System.IO.File]::WriteAllText($messagePath, ($subject + [string][char]10), (New-Object System.Text.UTF8Encoding($false)))
            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Creating the verified local commit...'
            $null = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments @('commit', ('--file=' + $messagePath))
            Remove-Item -LiteralPath $messagePath -Force -ErrorAction SilentlyContinue
            $messagePath = $null
            $newHeadResult = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments @('rev-parse', 'HEAD')
            $commitSha = ([string]$newHeadResult.Text).Trim()
            $commitCreated = $true
            Assert-GitPushVerifiedCommit -RepositoryRoot $canonicalRoot -ExpectedHead $commitSha -ExpectedBranch $snapshot.Branch -ExpectedParent $snapshot.Head -ExpectedTree $indexTree -ExpectedSubject $subject
        }
        else {
            $commitSha = $snapshot.Head
            if (-not $commitSha) {
                $lastMessage = 'No changes or existing commits are available to push.'
                Write-GitPushRunStatus -Path $statusPath -State 'OK' -Message $lastMessage
                Add-GitPushRunLog -Path $logPath -Message $lastMessage
                return [pscustomobject]@{
                    Success = $true; Busy = $false; Cancelled = $false; ExitCode = 0
                    Status = $lastMessage; CommitSha = ''; Subject = ''; StatusPath = $statusPath
                    LogPath = $logPath; RequestCount = 0
                }
            }
            Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'No new staged tree; pushing the existing commit...'
        }

        $phase = 'push'
        Write-GitPushRunStep -StatusPath $statusPath -LogPath $logPath -Message 'Pushing the exact verified commit without force...'
        $pushArguments = @('push', $snapshot.Remote, ($commitSha + ':' + $snapshot.TargetRef))
        $null = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments $pushArguments
        $pushSucceeded = $true
        if (-not $snapshot.HasUpstream) {
            $null = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments @(
                'config', '--replace-all', ('branch.' + $snapshot.Branch + '.remote'), $snapshot.Remote
            )
            $null = Get-GitPushCommandResult -RepositoryRoot $canonicalRoot -Arguments @(
                'config', '--replace-all', ('branch.' + $snapshot.Branch + '.merge'), $snapshot.TargetRef
            )
        }
        $afterStatus = Get-GitPushWorkingTreeStatus -RepositoryRoot $canonicalRoot
        if ($afterStatus.Length -gt 0) {
            $lastMessage = 'Push complete; newer local edits remain. Commit: ' + $subject
        }
        elseif ($hasNewCommit) {
            $lastMessage = 'Push complete. Commit: ' + $subject
        }
        else {
            $lastMessage = 'Push complete. Existing commit sent.'
        }
        Write-GitPushRunStatus -Path $statusPath -State 'OK' -Message $lastMessage
        Add-GitPushRunLog -Path $logPath -Message $lastMessage
        return [pscustomobject]@{
            Success = $true; Busy = $false; Cancelled = $false; ExitCode = 0
            Status = $lastMessage; CommitSha = $commitSha; Subject = $subject
            StatusPath = $statusPath; LogPath = $logPath
            RequestCount = if ($null -ne $selection) { [int]$selection.RequestCount } else { 0 }
        }
    }
    catch {
        $caughtExceptionMessage = [string]$_.Exception.Message
        switch ($phase) {
            'commit' {
                if ($commitCreated) { $lastMessage = 'Local commit verification failed; the commit is preserved and no push was attempted.' }
                else { $lastMessage = 'Commit failed or a Git hook rejected it; no push was attempted.' }
            }
            'push' {
                if ($pushSucceeded) { $lastMessage = 'Push succeeded; post-push bookkeeping failed. Local commit: ' + $commitSha }
                else { $lastMessage = 'Push was rejected or unavailable; any verified local commit is preserved.' }
            }
            'snapshot verification' { $lastMessage = 'Repository snapshot changed during generation; the tray made no commit or push.' }
            'change note' { $lastMessage = 'The change note could not be opened; no Git changes were made.' }
            default {
                if ($caughtExceptionMessage.StartsWith('Blocked protected path(s), with filenames only: ', [System.StringComparison]::Ordinal)) {
                    $lastMessage = $caughtExceptionMessage
                }
                elseif ($phase -eq 'repository preflight' -and $caughtExceptionMessage -eq 'Git requires an attached branch for tray push.') {
                    $lastMessage = 'Push stopped: check out a branch before pushing.'
                }
                elseif ($phase -eq 'repository preflight' -and $caughtExceptionMessage -eq 'Git has an operation in progress.') {
                    $lastMessage = 'Push stopped: finish or abort the active Git operation first.'
                }
                elseif ($phase -eq 'repository preflight' -and $caughtExceptionMessage -eq 'Git has unresolved index entries.') {
                    $lastMessage = 'Push stopped: resolve the unmerged paths first.'
                }
                elseif ($phase -eq 'repository preflight' -and $caughtExceptionMessage -eq 'No configured push remote is available.') {
                    $lastMessage = 'Push stopped: configure the branch upstream or an origin remote.'
                }
                else {
                    $lastMessage = 'Push stopped during ' + $phase + '; no force push was attempted.'
                }
            }
        }
        if ($ownsMutex) {
            try {
                $errorState = if ($pushSucceeded) { 'OK' } else { 'ERROR' }
                Write-GitPushRunStatus -Path $statusPath -State $errorState -Message $lastMessage
                Add-GitPushRunLog -Path $logPath -Message $lastMessage
            }
            catch {
                $lastMessage = 'Push stopped safely; the status file could not be updated.'
            }
        }
        return [pscustomobject]@{
            Success = $pushSucceeded; Busy = $false; Cancelled = $false; ExitCode = if ($pushSucceeded) { 0 } else { 1 }
            Status = $lastMessage; CommitSha = $commitSha; Subject = $subject
            StatusPath = $statusPath; LogPath = $logPath
            RequestCount = if ($null -ne $selection) { [int]$selection.RequestCount } else { 0 }
        }
    }
    finally {
        if ($null -ne $messagePath -and [System.IO.File]::Exists($messagePath)) {
            Remove-Item -LiteralPath $messagePath -Force -ErrorAction SilentlyContinue
        }
        if ($ownsApiKey -and $null -ne $apiKey) {
            $apiKey.Dispose()
        }
        if ($ownsMutex -and $null -ne $mutex) {
            try { $mutex.ReleaseMutex() } catch { }
        }
        if ($null -ne $mutex) {
            $mutex.Dispose()
        }
    }
}

if ($RunWorkflow) {
    $productionRoot = Split-Path -Parent $PSScriptRoot
    $workflowResult = Invoke-GitPushWorkflow -RepositoryRoot $productionRoot -PromptForChangeNote:$WithChangeNote
    exit ([int]$workflowResult.ExitCode)
}
