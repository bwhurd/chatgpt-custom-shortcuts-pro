param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$SettingsRoot
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'GitPushSupport.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    $currentSettings = Get-GitPushSettings -RepositoryRoot $RepositoryRoot -SettingsRoot $SettingsRoot
}
catch {
    [System.Windows.Forms.MessageBox]::Show(
        'Git push settings could not be read. Check the local settings folder and try again.',
        'Git push settings',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    return
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Git push settings'
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowInTaskbar = $true
$form.ClientSize = New-Object System.Drawing.Size(520, 330)

$intro = New-Object System.Windows.Forms.Label
$intro.Text = 'Choose whether Git push generates a descriptive commit subject with the OpenAI API.'
$intro.Location = New-Object System.Drawing.Point(18, 16)
$intro.Size = New-Object System.Drawing.Size(484, 38)
$form.Controls.Add($intro)

$aiSubjects = New-Object System.Windows.Forms.CheckBox
$aiSubjects.Text = 'Use AI-generated commit subjects'
$aiSubjects.Location = New-Object System.Drawing.Point(20, 62)
$aiSubjects.Size = New-Object System.Drawing.Size(470, 24)
$aiSubjects.Checked = [bool]$currentSettings.AiSubjectsEnabled
$form.Controls.Add($aiSubjects)

$keyLabel = New-Object System.Windows.Forms.Label
$keyLabel.Text = 'OpenAI API key'
$keyLabel.Location = New-Object System.Drawing.Point(20, 104)
$keyLabel.Size = New-Object System.Drawing.Size(470, 20)
$form.Controls.Add($keyLabel)

$keyBox = New-Object System.Windows.Forms.TextBox
$keyBox.Location = New-Object System.Drawing.Point(20, 128)
$keyBox.Size = New-Object System.Drawing.Size(480, 24)
$keyBox.UseSystemPasswordChar = $true
$keyBox.MaxLength = 4096
$form.Controls.Add($keyBox)

$status = New-Object System.Windows.Forms.Label
if ($currentSettings.HasApiKey) {
    $status.Text = 'A key is configured for this Windows user.'
}
else {
    $status.Text = 'No key is configured.'
}
$status.Location = New-Object System.Drawing.Point(20, 160)
$status.Size = New-Object System.Drawing.Size(480, 22)
$form.Controls.Add($status)

$help = New-Object System.Windows.Forms.Label
$help.Text = 'Leave the field blank to keep the saved key. Remove key takes effect when you save.'
$help.Location = New-Object System.Drawing.Point(20, 186)
$help.Size = New-Object System.Drawing.Size(480, 36)
$form.Controls.Add($help)

$testButton = New-Object System.Windows.Forms.Button
$testButton.Text = 'Test message generation'
$testButton.Location = New-Object System.Drawing.Point(20, 238)
$testButton.Size = New-Object System.Drawing.Size(190, 30)
$form.Controls.Add($testButton)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Text = 'Save'
$saveButton.Location = New-Object System.Drawing.Point(246, 284)
$saveButton.Size = New-Object System.Drawing.Size(78, 30)
$form.Controls.Add($saveButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = 'Cancel'
$cancelButton.Location = New-Object System.Drawing.Point(330, 284)
$cancelButton.Size = New-Object System.Drawing.Size(78, 30)
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)

$removeButton = New-Object System.Windows.Forms.Button
$removeButton.Text = 'Remove key'
$removeButton.Location = New-Object System.Drawing.Point(414, 284)
$removeButton.Size = New-Object System.Drawing.Size(86, 30)
$form.Controls.Add($removeButton)

$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton
$removeKeyPending = $false
$userChangedAiSubjects = $false
$aiSubjects.Add_CheckedChanged({
    $script:userChangedAiSubjects = $true
})

$removeButton.Add_Click({
    $script:removeKeyPending = $true
    $keyBox.Clear()
    $status.Text = 'The saved key will be removed when you save.'
})

$cancelButton.Add_Click({
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Close()
})

$testButton.Add_Click({
    $testButton.Enabled = $false
    $saveButton.Enabled = $false
    $cancelButton.Enabled = $false
    $removeButton.Enabled = $false
    $form.UseWaitCursor = $true
    $temporarySecureKey = $null
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        if ($script:removeKeyPending) {
            throw 'missing_api_key'
        }
        if (-not [string]::IsNullOrEmpty($keyBox.Text)) {
            $temporarySecureKey = ConvertTo-GitPushSecureString -Text $keyBox.Text
        }
        else {
            $temporarySecureKey = Get-GitPushApiKey -RepositoryRoot $RepositoryRoot -SettingsRoot $SettingsRoot
        }
        if ($null -eq $temporarySecureKey -or $temporarySecureKey.Length -lt 1) {
            $status.Text = 'No key is configured for a generation test.'
            [System.Windows.Forms.MessageBox]::Show(
                'Add a key or save one before testing message generation.',
                'Git push settings',
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Information
            ) | Out-Null
            return
        }

        $syntheticEvidence = [pscustomobject]@{
            Branch = 'synthetic-test'
            BaseTree = 'synthetic-base'
            SnapshotTree = 'synthetic-snapshot'
            ChangedCount = 1
            Changes = @([pscustomobject]@{
                status = 'M'; path = 'src/example.txt'; oldPath = 'src/example.txt'; newPath = 'src/example.txt'
                additions = '3'; deletions = '1'; patchOmittedReason = ''
            })
            Patches = @([pscustomobject]@{
                path = 'src/example.txt'; text = "@@ -1,2 +1,4 @@`r`n-old behavior`r`n+clearer behavior`r`n+cover edge case"; truncated = $false
            })
            Note = ''
            Omissions = @{}
        }
        $generation = Invoke-GitPushGeneration -Evidence $syntheticEvidence -ApiKey $temporarySecureKey
        $stopwatch.Stop()
        if ($generation.Success -and (Test-GitPushCommitSubject -Subject $generation.Subject)) {
            $status.Text = ('Generation test succeeded in {0:N1}s.' -f $stopwatch.Elapsed.TotalSeconds)
            $testMessage = ("Synthetic subject ({0}/52 characters):`r`n{1}" -f $generation.Subject.Length, $generation.Subject)
            [System.Windows.Forms.MessageBox]::Show(
                $testMessage,
                'Git push settings',
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Information
            ) | Out-Null
        }
        else {
            $safeCategory = [string]$generation.Category
            if ($safeCategory -notmatch '^[a-z0-9_]{1,48}$') { $safeCategory = 'generation_error' }
            $status.Text = ('Generation test did not produce a subject ({0}).' -f $safeCategory)
            [System.Windows.Forms.MessageBox]::Show(
                ('No subject was generated. Safe category: ' + $safeCategory + '.'),
                'Git push settings',
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            ) | Out-Null
        }
    }
    catch {
        $stopwatch.Stop()
        $status.Text = 'Generation test failed safely. Check the key and network, then try again.'
        [System.Windows.Forms.MessageBox]::Show(
            'The generation test failed. The key and response were not displayed.',
            'Git push settings',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
    }
    finally {
        if ($null -ne $temporarySecureKey) { $temporarySecureKey.Dispose() }
        $form.UseWaitCursor = $false
        $testButton.Enabled = $true
        $saveButton.Enabled = $true
        $cancelButton.Enabled = $true
        $removeButton.Enabled = $true
    }
})

$saveButton.Add_Click({
    $keyText = $keyBox.Text
    try {
        if ($script:removeKeyPending) {
            Remove-GitPushApiKey -RepositoryRoot $RepositoryRoot -SettingsRoot $SettingsRoot
        }
        if (-not [string]::IsNullOrEmpty($keyText)) {
            if (-not $script:userChangedAiSubjects) {
                $aiSubjects.Checked = $true
            }
            $secureKey = ConvertTo-GitPushSecureString -Text $keyText
            try {
                Set-GitPushApiKey -RepositoryRoot $RepositoryRoot -SettingsRoot $SettingsRoot -ApiKey $secureKey
            }
            finally {
                $secureKey.Dispose()
            }
        }
        Save-GitPushSettings -RepositoryRoot $RepositoryRoot -SettingsRoot $SettingsRoot -Settings ([pscustomobject]@{
            AiSubjectsEnabled = [bool]$aiSubjects.Checked
        }) | Out-Null
        $keyBox.Clear()
        $keyText = $null
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
    }
    catch {
        $keyBox.Clear()
        $keyText = $null
        [System.Windows.Forms.MessageBox]::Show(
            'Settings could not be saved. The key was not displayed. Check local permissions and try again.',
            'Git push settings',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
})

$null = $form.ShowDialog()
$form.Dispose()
