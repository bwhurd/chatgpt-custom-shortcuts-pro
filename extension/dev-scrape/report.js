(() => {
  const REPORT_KEY = 'devScrapeWideLastReport';
  const summaryEl = document.getElementById('report-summary');
  const alertsEl = document.getElementById('report-alerts');
  const rowsEl = document.getElementById('report-rows');

  const makeCell = (tag, className, text) => {
    const cell = document.createElement(tag);
    if (className) cell.className = className;
    if (typeof text === 'string') cell.textContent = text;
    return cell;
  };

  const renderAlerts = (report) => {
    const cards = [];
    if (Array.isArray(report.missingArtifacts) && report.missingArtifacts.length) {
      const card = document.createElement('section');
      card.className = 'alert-card is-danger';
      const title = document.createElement('h2');
      title.textContent = 'Missing Or Failed Dump States';
      const list = document.createElement('ul');
      report.missingArtifacts.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.filename}: ${item.reason || 'Capture failed'}`;
        list.appendChild(li);
      });
      card.append(title, list);
      cards.push(card);
    }

    if (Array.isArray(report.missingExpectedFiles) && report.missingExpectedFiles.length) {
      const card = document.createElement('section');
      card.className = 'alert-card';
      const title = document.createElement('h2');
      title.textContent = 'Expected Dump Files Not Present';
      const list = document.createElement('ul');
      report.missingExpectedFiles.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.filename} was missing while checking ${item.identifier}`;
        list.appendChild(li);
      });
      card.append(title, list);
      cards.push(card);
    }

    alertsEl.innerHTML = '';
    alertsEl.hidden = cards.length === 0;
    cards.forEach((card) => {
      alertsEl.appendChild(card);
    });
  };

  const renderRows = (report) => {
    rowsEl.innerHTML = '';
    if (!Array.isArray(report.rows) || !report.rows.length) {
      const row = document.createElement('tr');
      row.appendChild(makeCell('td', 'empty', 'No report rows found.'));
      row.firstChild.colSpan = 3;
      rowsEl.appendChild(row);
      return;
    }

    report.rows.forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(makeCell('td', 'identifier-cell', item.identifier));

      const filesCell = makeCell('td', 'files-cell');
      if (Array.isArray(item.files) && item.files.length) {
        const list = document.createElement('div');
        list.className = 'files-list';
        item.files.forEach((fileName) => {
          const chip = document.createElement('span');
          chip.className = 'file-chip';
          chip.textContent = fileName;
          list.appendChild(chip);
        });
        filesCell.appendChild(list);
      } else {
        filesCell.textContent = 'Not found in the latest scrape set. This likely needs repair.';
      }
      row.appendChild(filesCell);

      const statusCell = makeCell('td');
      const pill = document.createElement('span');
      pill.className = `status-pill ${item.status === 'pass' ? 'pass' : 'fail'}`;
      pill.textContent = item.status === 'pass' ? '✓' : 'X';
      statusCell.appendChild(pill);
      row.appendChild(statusCell);

      rowsEl.appendChild(row);
    });
  };

  chrome.storage.local.get([REPORT_KEY], (stored) => {
    const report = stored?.[REPORT_KEY];
    if (!report) {
      summaryEl.textContent =
        'No legacy in-extension report is stored. Run the Playwright validator from tests/playwright/devscrape-wide.mjs instead.';
      rowsEl.innerHTML = '';
      const row = document.createElement('tr');
      row.appendChild(
        makeCell(
          'td',
          'empty',
          'Use: node tests/playwright/devscrape-wide.mjs --action validate-wide',
        ),
      );
      row.firstChild.colSpan = 3;
      rowsEl.appendChild(row);
      return;
    }

    const summary = report.summary || {};
    summaryEl.textContent =
      `Folder: ${report.folderName || '(unknown)'} | ` +
      `Passed: ${summary.passed || 0} | Failed: ${summary.failed || 0} | ` +
      `Generated: ${report.generatedAt || '(unknown)'}`;
    renderAlerts(report);
    renderRows(report);
  });
})();
