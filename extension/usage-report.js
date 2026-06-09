(() => {
  const summaryGrid = document.getElementById('summaryGrid');
  const subtitle = document.getElementById('subtitle');
  const groupRows = document.getElementById('groupRows');
  const actionRows = document.getElementById('actionRows');
  const toggleRows = document.getElementById('toggleRows');
  const shortcutRows = document.getElementById('shortcutRows');
  const refreshBtn = document.getElementById('refreshBtn');
  const copyJsonBtn = document.getElementById('copyJsonBtn');
  let currentReport = null;

  const labelize = (value) =>
    String(value || '')
      .replace(/^shortcutKey/, '')
      .replace(/^modelPickerSlot:/, 'Model picker slot ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (char) => char.toUpperCase());

  const sendMessage = (message) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    });

  const setRows = (tbody, rows, renderCells, emptyText) => {
    tbody.textContent = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'empty';
      td.colSpan = 4;
      td.textContent = emptyText;
      tr.append(td);
      tbody.append(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      renderCells(row).forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      });
      tbody.append(tr);
    });
  };

  const addMetric = (label, value) => {
    const item = document.createElement('div');
    item.className = 'metric';
    const labelEl = document.createElement('div');
    labelEl.className = 'metric-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'metric-value';
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    summaryGrid.append(item);
  };

  const formatTimestamp = (value) => {
    const numberValue = Number(value || 0);
    return numberValue > 0 ? new Date(numberValue).toLocaleString() : 'Never';
  };

  const render = (report) => {
    currentReport = report;
    summaryGrid.textContent = '';
    const generated = report.generatedAt
      ? new Date(report.generatedAt).toLocaleString()
      : 'unknown';
    subtitle.textContent = `Generated ${generated}. Network flush is ${
      report.networkEnabled
        ? `configured for ${report.analyticsHost}`
        : 'disabled until an Aptabase app key is set'
    }.`;

    addMetric('Total shortcut uses', String(report.totalShortcutUses || 0));
    addMetric('Distinct shortcuts', String(report.distinctShortcutsUsed || 0));
    addMetric('Observed days', `${report.daysObserved || 0} / ${report.retentionDays || 7}`);
    addMetric('Network flush', report.networkEnabled ? 'Enabled' : 'Local only');
    addMetric('Last attempt', formatTimestamp(report.lastFlushAttemptAt));
    addMetric('Last success', formatTimestamp(report.lastFlushAt));

    const groups = (report.groupRows || []).sort(
      (a, b) => b.count - a.count || a.group.localeCompare(b.group),
    );
    setRows(
      groupRows,
      groups,
      (row) => [labelize(row.group), row.used ? 'Yes' : 'No', String(row.count), row.bucket],
      'No shortcut groups recorded yet.',
    );

    const actions = (report.actionRows || [])
      .filter((row) => row.used)
      .sort((a, b) => b.count - a.count || a.actionId.localeCompare(b.actionId));
    setRows(
      actionRows,
      actions,
      (row) => [labelize(row.actionId), labelize(row.group), String(row.count), row.bucket],
      'No shortcut actions recorded yet.',
    );

    setRows(
      toggleRows,
      report.toggleRows || [],
      (row) => [labelize(row.key), row.value ? 'On' : 'Off'],
      'No toggle snapshot available.',
    );

    const stateOrder = { custom: 0, blank: 1, default: 2 };
    const shortcutSettings = (report.shortcutRows || [])
      .slice()
      .sort(
        (a, b) =>
          (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || a.key.localeCompare(b.key),
      );
    setRows(
      shortcutRows,
      shortcutSettings,
      (row) => [labelize(row.key), labelize(row.state)],
      'No shortcut setting snapshot available.',
    );
  };

  const load = async () => {
    subtitle.textContent = 'Loading local usage summary...';
    const report = await sendMessage({ type: 'csp.analytics.getReport' });
    if (!report?.ok) throw new Error(report?.reason || 'Report failed');
    render(report);
  };

  refreshBtn.addEventListener('click', () => {
    load().catch((error) => {
      subtitle.textContent = `Report failed: ${error.message}`;
    });
  });

  copyJsonBtn.addEventListener('click', async () => {
    if (!currentReport) return;
    await navigator.clipboard.writeText(JSON.stringify(currentReport, null, 2));
    copyJsonBtn.textContent = 'Copied';
    setTimeout(() => {
      copyJsonBtn.textContent = 'Copy JSON';
    }, 1200);
  });

  load().catch((error) => {
    subtitle.textContent = `Report failed: ${error.message}`;
  });
})();
