param(
    [int]$Days = 30,
    [string]$SshTarget = 'librechat-vm',
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$OutputDir = Join-Path $ProjectRoot '_temp-files\usage-analytics'
$HtmlReportPath = Join-Path $OutputDir 'latest-aggregate-report.html'
$JsonReportPath = Join-Path $OutputDir 'latest-aggregate-report.json'
$DashboardUrl = 'https://cgcsp.chordstash.com'
$MetricLabels = @{
    't_select_then_copy_all_messages_bot_i1de' = 'select then copy all messages: both user and assistant'
    't_select_then_copy_all_messages_onl_1jdl' = 'select then copy all messages: only user'
    't_select_then_copy_all_messages_onl_1ka6' = 'select then copy all messages: only assistant'
}
$ToggleDefaults = @{
    't_page_up_down_takeover' = $true
    't_move_top_bar_to_bottom' = $false
    't_remove_markdown_on_copy' = $true
    't_click_to_copy_inline_code' = $false
    't_hide_pasted_library_files' = $false
    't_color_bold_text' = $false
    't_show_legacy_arrow_buttons' = $false
    't_fade_slim_sidebar' = $false
    't_enable_send_with_control_enter' = $true
    't_enable_stop_with_control_backspace' = $true
    't_disable_copy_after_select' = $false
    't_do_not_include_labels' = $false
    't_select_then_copy_all_messages_bot_i1de' = $true
    't_select_then_copy_all_messages_onl_1jdl' = $false
    't_select_then_copy_all_messages_onl_1ka6' = $false
    't_use_alt_for_model_switcher' = $true
    't_use_control_for_model_switcher' = $false
}
$BlankDefaultShortcutKeys = @(
    's_add_photos_files',
    's_cancel_dictation',
    's_create_image',
    's_model_slot_10',
    's_model_slot_11',
    's_model_slot_12',
    's_model_slot_13',
    's_model_slot_14',
    's_model_slot_15',
    's_model_slot_8',
    's_model_slot_9',
    's_more_dots_branch_in_new_chat',
    's_more_dots_read_aloud',
    's_new_gpt_conversation',
    's_pro_extended',
    's_pro_standard',
    's_regenerate_add_details',
    's_regenerate_ask_to_change_response',
    's_regenerate_more_concise',
    's_regenerate_with_different_model',
    's_share',
    's_study',
    's_think_longer',
    's_thinking_extended',
    's_thinking_heavy',
    's_thinking_light',
    's_thinking_standard',
    's_toggle_canvas',
    's_toggle_codebox_wrap'
)

function Invoke-ClickHouseJsonRows {
    param([Parameter(Mandatory = $true)][string]$Query)

    $remoteCommand = 'docker exec -i cgcsp-aptabase-events-db clickhouse-client'
    $output = $Query | & ssh -o BatchMode=yes -o ConnectTimeout=8 $SshTarget $remoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "ClickHouse query failed through SSH target '$SshTarget'."
    }

    @($output | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
}

function ConvertFrom-JsonObjectString {
    param([string]$Json)

    $result = @{}
    if ([string]::IsNullOrWhiteSpace($Json)) {
        return $result
    }

    $object = $Json | ConvertFrom-Json
    foreach ($property in $object.PSObject.Properties) {
        $result[$property.Name] = $property.Value
    }
    return $result
}

function ConvertTo-ClickHouseStringArray {
    param([string[]]$Values)

    $items = @($Values | Sort-Object | ForEach-Object {
        "'$($_.Replace("'", "''"))'"
    })
    return '[' + ($items -join ',') + ']'
}

function Get-FullEventWhereClause {
    param([string]$EventName)

    return @"
event_name = '$EventName'
    AND timestamp >= now() - INTERVAL $Days DAY
    AND JSONExtractString(string_props, 'extension_version') != ''
    AND JSONExtractInt(numeric_props, 'schema_version') = 1
"@
}

function Format-Percent {
    param(
        [double]$Numerator,
        [double]$Denominator
    )

    if ($Denominator -le 0) {
        return '0.0%'
    }
    return ('{0:N1}%' -f (($Numerator / $Denominator) * 100))
}

function Format-Number {
    param([double]$Value)

    return '{0:N1}' -f $Value
}

function Get-BucketMidpoint {
    param([string]$Bucket)

    switch ($Bucket) {
        '0' { return 0.0 }
        '1' { return 1.0 }
        '2_5' { return 3.5 }
        '6_20' { return 13.0 }
        '21_100' { return 60.5 }
        '101_plus' { return 101.0 }
        default { return 0.0 }
    }
}

function ConvertTo-Label {
    param([string]$Key)

    if ($MetricLabels.ContainsKey($Key)) {
        return $MetricLabels[$Key]
    }

    $label = $Key `
        -replace '^used_', '' `
        -replace '^use_bucket_', '' `
        -replace '^u_', '' `
        -replace '^ub_', '' `
        -replace '^t_', '' `
        -replace '^s_', '' `
        -replace '_7d$', ''
    return ($label -replace '_', ' ')
}

function ConvertTo-HtmlText {
    param($Value)

    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function New-HtmlTable {
    param(
        [string]$Title,
        [object[]]$Rows,
        [string[]]$Columns
    )

    $html = New-Object System.Text.StringBuilder
    [void]$html.AppendLine("<section>")
    [void]$html.AppendLine("<h2>$(ConvertTo-HtmlText $Title)</h2>")
    if (-not $Rows -or $Rows.Count -eq 0) {
        [void]$html.AppendLine('<p class="muted">No rows for this window.</p>')
        [void]$html.AppendLine('</section>')
        return $html.ToString()
    }

    [void]$html.AppendLine('<table>')
    [void]$html.AppendLine('<thead><tr>')
    foreach ($column in $Columns) {
        [void]$html.AppendLine("<th>$(ConvertTo-HtmlText $column)</th>")
    }
    [void]$html.AppendLine('</tr></thead>')
    [void]$html.AppendLine('<tbody>')
    foreach ($row in $Rows) {
        [void]$html.AppendLine('<tr>')
        foreach ($column in $Columns) {
            [void]$html.AppendLine("<td>$(ConvertTo-HtmlText $row.$column)</td>")
        }
        [void]$html.AppendLine('</tr>')
    }
    [void]$html.AppendLine('</tbody></table>')
    [void]$html.AppendLine('</section>')
    return $html.ToString()
}

function Get-KeysFromLatestEvent {
    param(
        [string]$EventName,
        [string]$Prefix
    )

    $whereClause = Get-FullEventWhereClause $EventName
    $query = @"
SELECT string_props
FROM default.events
WHERE $whereClause
ORDER BY timestamp DESC
LIMIT 1
FORMAT JSONEachRow
"@
    $latest = @(Invoke-ClickHouseJsonRows $query | Select-Object -First 1)
    if ($latest.Count -eq 0) {
        return @()
    }

    $props = ConvertFrom-JsonObjectString $latest[0].string_props
    return @($props.Keys | Where-Object { $_ -like "$Prefix*" } | Sort-Object)
}

function Get-BooleanStats {
    param(
        [string]$EventName,
        [string[]]$Keys,
        [string]$TrueColumnName = 'Active'
    )

    if (-not $Keys -or $Keys.Count -eq 0) {
        return @()
    }

    $keyArray = ConvertTo-ClickHouseStringArray $Keys
    $whereClause = Get-FullEventWhereClause $EventName
    $query = @"
WITH $keyArray AS keys
SELECT
  key,
  countIf(JSONExtractString(string_props, key) != '') AS reports,
  countIf(JSONExtractString(string_props, key) = 'true') AS active_count
FROM
(
  SELECT string_props, arrayJoin(keys) AS key
  FROM default.events
  WHERE $whereClause
)
GROUP BY key
ORDER BY active_count DESC, key ASC
FORMAT JSONEachRow
"@

    @(Invoke-ClickHouseJsonRows $query | ForEach-Object {
        $reports = [double]$_.reports
        $active = [double]$_.active_count
        [pscustomobject]@{
            Metric = ConvertTo-Label $_.key
            Key = $_.key
            Reports = [int]$reports
            $TrueColumnName = [int]$active
            Percent = Format-Percent $active $reports
        }
    })
}

function Get-StateStats {
    param(
        [string]$EventName,
        [string[]]$Keys
    )

    if (-not $Keys -or $Keys.Count -eq 0) {
        return @()
    }

    $keyArray = ConvertTo-ClickHouseStringArray $Keys
    $whereClause = Get-FullEventWhereClause $EventName
    $query = @"
WITH $keyArray AS keys
SELECT
  key,
  state,
  count() AS state_count
FROM
(
  SELECT
    arrayJoin(keys) AS key,
    JSONExtractString(string_props, key) AS state
  FROM default.events
  WHERE $whereClause
)
WHERE state != ''
GROUP BY key, state
ORDER BY key ASC, state ASC
FORMAT JSONEachRow
"@

    $rawRows = @(Invoke-ClickHouseJsonRows $query)
    $totals = @{}
    foreach ($row in $rawRows) {
        $key = [string]$row.key
        if (-not $totals.ContainsKey($key)) {
            $totals[$key] = 0
        }
        $totals[$key] += [int]$row.state_count
    }

    @(foreach ($row in $rawRows) {
        $key = [string]$row.key
        $count = [int]$row.state_count
        [pscustomobject]@{
            Shortcut = ConvertTo-Label $key
            Key = $key
            State = [string]$row.state
            Reports = $totals[$key]
            Count = $count
            Percent = Format-Percent $count $totals[$key]
        }
    })
}

function Get-UsageIntensityStats {
    param([string[]]$Keys)

    if (-not $Keys -or $Keys.Count -eq 0) {
        return @()
    }

    $keyArray = ConvertTo-ClickHouseStringArray $Keys
    $whereClause = Get-FullEventWhereClause 'usage_summary_v1'
    $query = @"
WITH $keyArray AS keys
SELECT
  key,
  bucket,
  count() AS report_count,
  sum(observed_days) AS observed_days
FROM
(
  SELECT
    arrayJoin(keys) AS key,
    JSONExtractString(string_props, key) AS bucket,
    if(JSONExtractInt(numeric_props, 'days_observed_7d') > 0, JSONExtractInt(numeric_props, 'days_observed_7d'), 1) AS observed_days
  FROM default.events
  WHERE $whereClause
)
WHERE bucket != ''
GROUP BY key, bucket
ORDER BY key ASC, bucket ASC
FORMAT JSONEachRow
"@

    $rawRows = @(Invoke-ClickHouseJsonRows $query)
    $byKey = @{}
    foreach ($row in $rawRows) {
        $key = [string]$row.key
        if (-not $byKey.ContainsKey($key)) {
            $byKey[$key] = @()
        }
        $byKey[$key] += $row
    }

    @(foreach ($key in ($byKey.Keys | Sort-Object)) {
        $rows = @($byKey[$key])
        $reports = ($rows | Measure-Object -Property report_count -Sum).Sum
        $observedDays = ($rows | Measure-Object -Property observed_days -Sum).Sum
        $usedReports = ($rows | Where-Object { [string]$_.bucket -ne '0' } | Measure-Object -Property report_count -Sum).Sum
        $estimatedUses = 0.0
        foreach ($row in $rows) {
            $estimatedUses += (Get-BucketMidpoint ([string]$row.bucket)) * [double]$row.report_count
        }
        $commonBucket = @($rows | Sort-Object -Property @{ Expression = 'report_count'; Descending = $true }, bucket | Select-Object -First 1)[0]
        $bucketBreakdown = ($rows | Sort-Object bucket | ForEach-Object {
            "$($_.bucket):$($_.report_count)"
        }) -join ', '

        [pscustomobject]@{
            Shortcut = ConvertTo-Label $key
            Key = $key
            Reports = [int]$reports
            Used = [int]$usedReports
            'Used %' = Format-Percent $usedReports $reports
            'Est 7d Uses/Report' = Format-Number ($estimatedUses / [Math]::Max(1, [double]$reports))
            'Est Uses/Observed Day' = Format-Number ($estimatedUses / [Math]::Max(1, [double]$observedDays))
            'Top Bucket' = [string]$commonBucket.bucket
            'Bucket Breakdown' = $bucketBreakdown
        }
    })
}

function Get-ShortcutDefaultState {
    param([string]$Key)

    if ($BlankDefaultShortcutKeys -contains $Key) {
        return 'blank'
    }
    return 'default'
}

function Get-ChangedFromDefaultRows {
    param(
        [object[]]$ToggleRows,
        [object[]]$ShortcutStateRows
    )

    $rows = New-Object System.Collections.Generic.List[object]

    foreach ($toggle in $ToggleRows) {
        $key = [string]$toggle.Key
        if (-not $ToggleDefaults.ContainsKey($key)) {
            continue
        }

        $reports = [int]$toggle.Reports
        $onCount = [int]$toggle.On
        $defaultOn = [bool]$ToggleDefaults[$key]
        $changed = if ($defaultOn) { $reports - $onCount } else { $onCount }
        $rows.Add([pscustomobject]@{
            Type = 'toggle'
            Item = ConvertTo-Label $key
            Default = if ($defaultOn) { 'on' } else { 'off' }
            Reports = $reports
            Changed = [int]$changed
            Percent = Format-Percent $changed $reports
            Breakdown = "on:$onCount, off:$($reports - $onCount)"
        })
    }

    $shortcutGroups = $ShortcutStateRows | Group-Object Key
    foreach ($group in $shortcutGroups) {
        $key = [string]$group.Name
        $defaultState = Get-ShortcutDefaultState $key
        $reports = ($group.Group | Measure-Object -Property Count -Sum).Sum
        $changed = ($group.Group |
            Where-Object { [string]$_.State -ne $defaultState } |
            Measure-Object -Property Count -Sum).Sum
        if ($null -eq $changed) {
            $changed = 0
        }
        $breakdown = ($group.Group | Sort-Object State | ForEach-Object {
            "$($_.State):$($_.Count)"
        }) -join ', '

        $rows.Add([pscustomobject]@{
            Type = 'shortcut'
            Item = ConvertTo-Label $key
            Default = $defaultState
            Reports = [int]$reports
            Changed = [int]$changed
            Percent = Format-Percent $changed $reports
            Breakdown = $breakdown
        })
    }

    @($rows | Sort-Object -Property @{ Expression = 'Changed'; Descending = $true }, Type, Item)
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$generatedAt = Get-Date
$fullSchemaWindowWhere = @"
timestamp >= now() - INTERVAL $Days DAY
  AND JSONExtractString(string_props, 'extension_version') != ''
  AND JSONExtractInt(numeric_props, 'schema_version') = 1
"@
$eventCountsQuery = @"
SELECT
  event_name,
  app_version,
  count() AS report_count,
  max(timestamp) AS latest_timestamp
FROM default.events
WHERE event_name IN ('usage_summary_v1', 'settings_snapshot_v1')
  AND $fullSchemaWindowWhere
GROUP BY event_name, app_version
ORDER BY event_name ASC, app_version DESC
FORMAT JSONEachRow
"@
$eventCounts = @(Invoke-ClickHouseJsonRows $eventCountsQuery | ForEach-Object {
    [pscustomobject]@{
        Event = $_.event_name
        Version = $_.app_version
        Reports = [int]$_.report_count
        Latest = $_.latest_timestamp
    }
})

$usageGroupKeys = Get-KeysFromLatestEvent 'usage_summary_v1' 'used_'
$usageActionKeys = @(Get-KeysFromLatestEvent 'usage_summary_v1' 'u_' | Where-Object {
    $_ -notlike 'ub_*'
})
$usageBucketKeys = Get-KeysFromLatestEvent 'usage_summary_v1' 'ub_'
$toggleKeys = Get-KeysFromLatestEvent 'settings_snapshot_v1' 't_'
$shortcutKeys = Get-KeysFromLatestEvent 'settings_snapshot_v1' 's_'

$usageGroupRows = Get-BooleanStats 'usage_summary_v1' $usageGroupKeys 'Used'
$usageActionRows = @(Get-BooleanStats 'usage_summary_v1' $usageActionKeys 'Used' |
    Where-Object { $_.Used -gt 0 } |
    Sort-Object -Property @{ Expression = 'Used'; Descending = $true }, Metric)
$usageIntensityRows = @(Get-UsageIntensityStats $usageBucketKeys |
    Where-Object { $_.Used -gt 0 } |
    Sort-Object -Property @{ Expression = 'Used'; Descending = $true }, Shortcut)
$toggleRows = Get-BooleanStats 'settings_snapshot_v1' $toggleKeys 'On'
$shortcutStateRows = Get-StateStats 'settings_snapshot_v1' $shortcutKeys
$changedFromDefaultRows = Get-ChangedFromDefaultRows $toggleRows $shortcutStateRows

$distinctQuery = @"
SELECT
  JSONExtractInt(numeric_props, 'distinct_shortcuts_used_7d') AS distinct_shortcuts,
  count() AS report_count
FROM default.events
WHERE $(Get-FullEventWhereClause 'usage_summary_v1')
GROUP BY distinct_shortcuts
ORDER BY distinct_shortcuts ASC
FORMAT JSONEachRow
"@
$distinctRawRows = @(Invoke-ClickHouseJsonRows $distinctQuery)
$distinctTotal = ($distinctRawRows | Measure-Object -Property report_count -Sum).Sum
$distinctRows = @($distinctRawRows | ForEach-Object {
    $count = [int]$_.report_count
    [pscustomobject]@{
        'Distinct Shortcuts' = [int]$_.distinct_shortcuts
        Reports = $count
        Percent = Format-Percent $count $distinctTotal
    }
})

$useBucketQuery = @"
SELECT
  JSONExtractString(string_props, 'total_shortcut_uses_7d_bucket') AS Bucket,
  count() AS report_count
FROM default.events
WHERE $(Get-FullEventWhereClause 'usage_summary_v1')
GROUP BY Bucket
ORDER BY Bucket ASC
FORMAT JSONEachRow
"@
$useBucketRawRows = @(Invoke-ClickHouseJsonRows $useBucketQuery)
$useBucketTotal = ($useBucketRawRows | Measure-Object -Property report_count -Sum).Sum
$useBucketRows = @($useBucketRawRows | ForEach-Object {
    $count = [int]$_.report_count
    [pscustomobject]@{
        Bucket = if ($_.Bucket) { $_.Bucket } else { 'unknown' }
        Reports = $count
        Percent = Format-Percent $count $useBucketTotal
    }
})

$shortcutObservationTotal = ($shortcutStateRows | Measure-Object -Property Count -Sum).Sum
$shortcutSummaryRows = @(
    $shortcutStateRows |
        Group-Object State |
        ForEach-Object {
            $stateCount = ($_.Group | Measure-Object -Property Count -Sum).Sum
            [pscustomobject]@{
                State = $_.Name
                Count = $stateCount
                Reports = ($_.Group | Measure-Object -Property Reports -Maximum).Maximum
                Percent = Format-Percent $stateCount $shortcutObservationTotal
            }
        } |
        Sort-Object State
)

$usageReportCount = ($eventCounts | Where-Object { $_.Event -eq 'usage_summary_v1' } | Measure-Object -Property Reports -Sum).Sum
$settingsReportCount = ($eventCounts | Where-Object { $_.Event -eq 'settings_snapshot_v1' } | Measure-Object -Property Reports -Sum).Sum
$latestEvent = @($eventCounts | Sort-Object Latest -Descending | Select-Object -First 1)[0]
$topGroup = @($usageGroupRows | Sort-Object -Property @{ Expression = 'Used'; Descending = $true }, Metric | Select-Object -First 1)[0]
$topShortcut = @($usageIntensityRows | Sort-Object -Property @{ Expression = 'Used'; Descending = $true }, Shortcut | Select-Object -First 1)[0]
$distinctReportTotal = ($distinctRows | Measure-Object -Property Reports -Sum).Sum
$weightedDistinct = 0.0
foreach ($row in $distinctRows) {
    $weightedDistinct += [double]$row.'Distinct Shortcuts' * [double]$row.Reports
}
$averageDistinctShortcuts = Format-Number ($weightedDistinct / [Math]::Max(1, [double]$distinctReportTotal))
$blankShortcutSummary = @($shortcutSummaryRows | Where-Object { $_.State -eq 'blank' } | Select-Object -First 1)[0]
$defaultShortcutSummary = @($shortcutSummaryRows | Where-Object { $_.State -eq 'default' } | Select-Object -First 1)[0]
$changedItemCount = @($changedFromDefaultRows | Where-Object { $_.Changed -gt 0 }).Count
$highestChangedItem = @($changedFromDefaultRows | Sort-Object -Property @{ Expression = 'Changed'; Descending = $true }, Item | Select-Object -First 1)[0]

$summaryRows = @(
    [pscustomobject]@{
        Label = 'Usage reports'
        Value = [int]$usageReportCount
        Detail = 'Full schema shortcut usage summaries in this window'
    },
    [pscustomobject]@{
        Label = 'Settings reports'
        Value = [int]$settingsReportCount
        Detail = 'Full schema settings snapshots in this window'
    },
    [pscustomobject]@{
        Label = 'Latest version'
        Value = if ($latestEvent) { $latestEvent.Version } else { 'none' }
        Detail = if ($latestEvent) { "Latest event at $($latestEvent.Latest)" } else { 'No events found' }
    },
    [pscustomobject]@{
        Label = 'Top feature group'
        Value = if ($topGroup) { $topGroup.Metric } else { 'none' }
        Detail = if ($topGroup) { "$($topGroup.Percent) of usage reports" } else { 'No usage rows found' }
    },
    [pscustomobject]@{
        Label = 'Top shortcut'
        Value = if ($topShortcut) { $topShortcut.Shortcut } else { 'none' }
        Detail = if ($topShortcut) { "$($topShortcut.'Used %') used; est $($topShortcut.'Est 7d Uses/Report') uses/report" } else { 'No shortcut usage found' }
    },
    [pscustomobject]@{
        Label = 'Avg distinct shortcuts'
        Value = $averageDistinctShortcuts
        Detail = 'Average distinct shortcut actions used in the reported 7-day local window'
    },
    [pscustomobject]@{
        Label = 'Items changed from default'
        Value = [int]$changedItemCount
        Detail = if ($changedItemCount -gt 0 -and $highestChangedItem) { "Highest: $($highestChangedItem.Item) at $($highestChangedItem.Percent)" } else { 'No tracked items changed from default in this sample' }
    },
    [pscustomobject]@{
        Label = 'Blank shortcut fields'
        Value = if ($blankShortcutSummary) { $blankShortcutSummary.Percent } else { '0.0%' }
        Detail = 'Share of tracked shortcut slots reported as blank'
    },
    [pscustomobject]@{
        Label = 'Default shortcut fields'
        Value = if ($defaultShortcutSummary) { $defaultShortcutSummary.Percent } else { '0.0%' }
        Detail = 'Share of tracked shortcut slots still at default'
    }
)

$report = [ordered]@{
    generatedAt = $generatedAt.ToString('o')
    days = $Days
    dashboardUrl = $DashboardUrl
    summary = $summaryRows
    eventCounts = $eventCounts
    usageGroups = $usageGroupRows
    usedActions = $usageActionRows
    usedActionIntensity = $usageIntensityRows
    distinctShortcutDistribution = $distinctRows
    totalShortcutUseBuckets = $useBucketRows
    changedFromDefault = $changedFromDefaultRows
    toggles = $toggleRows
    shortcutStateSummary = $shortcutSummaryRows
    shortcutStates = $shortcutStateRows
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $JsonReportPath -Encoding UTF8

$summaryCards = ($summaryRows | ForEach-Object {
    @"
    <article class="summary-card">
      <div class="summary-label">$(ConvertTo-HtmlText $_.Label)</div>
      <div class="summary-value">$(ConvertTo-HtmlText $_.Value)</div>
      <div class="summary-detail">$(ConvertTo-HtmlText $_.Detail)</div>
    </article>
"@
}) -join "`n"

$overviewSections = @()
$overviewSections += New-HtmlTable 'Shortcut Group Adoption' $usageGroupRows @('Metric', 'Reports', 'Used', 'Percent')
$overviewSections += New-HtmlTable 'Shortcut Action Usage And Intensity' ($usageIntensityRows | Select-Object -First 40) @('Shortcut', 'Reports', 'Used', 'Used %', 'Est 7d Uses/Report', 'Est Uses/Observed Day', 'Top Bucket', 'Bucket Breakdown')
$overviewSections += New-HtmlTable 'Distinct Shortcuts Used In Last 7 Days' $distinctRows @('Distinct Shortcuts', 'Reports', 'Percent')
$overviewSections += New-HtmlTable 'Total Shortcut Use Buckets' $useBucketRows @('Bucket', 'Reports', 'Percent')

$settingsSections = @()
$settingsSections += New-HtmlTable 'Changed From Default' $changedFromDefaultRows @('Type', 'Item', 'Default', 'Reports', 'Changed', 'Percent', 'Breakdown')
$settingsSections += New-HtmlTable 'Toggle On Percentages' $toggleRows @('Metric', 'Reports', 'On', 'Percent')
$settingsSections += New-HtmlTable 'Shortcut Assignment Summary' $shortcutSummaryRows @('State', 'Count', 'Reports', 'Percent')
$settingsSections += New-HtmlTable 'Shortcut Assignment States' $shortcutStateRows @('Shortcut', 'State', 'Reports', 'Count', 'Percent')

$dataHealthSections = @()
$dataHealthSections += New-HtmlTable 'Stored Events By Version' $eventCounts @('Event', 'Version', 'Reports', 'Latest')

$html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CGCSP Aggregate Usage Report</title>
  <style>
    body { margin: 0; padding: 28px; font-family: Segoe UI, Arial, sans-serif; color: #18181b; background: #f4f4f5; }
    main { max-width: 1180px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 10px; font-size: 18px; }
    p { margin: 6px 0; }
    a { color: #2563eb; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d4d4d8; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e4e4e7; text-align: left; font-size: 13px; }
    th { background: #e4e4e7; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .muted { color: #52525b; }
    .meta { padding: 14px 16px; background: #fff; border: 1px solid #d4d4d8; }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 18px 0 10px; }
    .summary-card { background: #fff; border: 1px solid #d4d4d8; padding: 14px; }
    .summary-label { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #52525b; }
    .summary-value { margin-top: 6px; font-size: 24px; font-weight: 700; }
    .summary-detail { margin-top: 4px; font-size: 12px; color: #52525b; line-height: 1.35; }
    .note { margin-top: 12px; padding: 12px 14px; background: #eef2ff; border: 1px solid #c7d2fe; color: #312e81; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 0; }
    .tab-button { border: 1px solid #d4d4d8; background: #fff; color: #18181b; padding: 9px 14px; font: inherit; font-weight: 700; cursor: pointer; }
    .tab-button.active { background: #18181b; color: #fff; border-color: #18181b; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
  </style>
</head>
<body>
<main>
  <h1>CGCSP Aggregate Usage Report</h1>
  <div class="meta">
    <p>Generated: $(ConvertTo-HtmlText $generatedAt)</p>
    <p>Window: last $(ConvertTo-HtmlText $Days) days</p>
    <p>Dashboard: <a href="$DashboardUrl">$DashboardUrl</a></p>
    <p class="muted">Percentages use full schema active reporting install-days as the denominator; validation probes are excluded. No raw shortcut keys, chats, prompts, responses, URLs, account info, or model names are collected.</p>
    <p class="muted">Raw aggregate JSON: $(ConvertTo-HtmlText $JsonReportPath)</p>
  </div>
  <div class="summary-grid">
  $summaryCards
  </div>
  <p class="note">Shortcut intensity is estimated from privacy-preserving buckets such as 1, 2-5, and 6-20 uses. It is intended for prioritization, not exact per-user accounting.</p>
  <nav class="tabs" aria-label="Report sections">
    <button class="tab-button active" type="button" data-tab="overview">Overview</button>
    <button class="tab-button" type="button" data-tab="settings">Settings changes</button>
    <button class="tab-button" type="button" data-tab="data-health">Data health</button>
  </nav>
  <div id="overview" class="tab-panel active">
  $($overviewSections -join "`n")
  </div>
  <div id="settings" class="tab-panel">
  $($settingsSections -join "`n")
  </div>
  <div id="data-health" class="tab-panel">
  $($dataHealthSections -join "`n")
  </div>
</main>
<script>
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      document.querySelectorAll('.tab-button').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === tabId);
      });
    });
  });
</script>
</body>
</html>
"@
$html | Set-Content -LiteralPath $HtmlReportPath -Encoding UTF8

if (-not $NoOpen) {
    Start-Process -FilePath $HtmlReportPath
}

Write-Output "Generated aggregate usage report: $HtmlReportPath"
Write-Output "Generated aggregate usage JSON: $JsonReportPath"
