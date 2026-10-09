const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const preflightPath = path.join(repositoryRoot, 'scripts', 'check-live-chrome-profile.ps1');
const source = fs.readFileSync(preflightPath, 'utf8');
const parserMatch = source.match(
  /# BEGIN TESTABLE CHROME COMMAND LINE PARSER\r?\n([\s\S]*?)\r?\n# END TESTABLE CHROME COMMAND LINE PARSER/,
);

assert.ok(parserMatch, 'Expected the production command-line parser test region.');

const expectedProfile =
  'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\User Data\\CodexCleanProfile';
const cases = [
  {
    name: 'whole arguments quoted for paths with spaces',
    commandLine: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "--user-data-dir=${expectedProfile}" "--remote-debugging-port=9333"`,
    expected: true,
    extensionsDisabled: false,
  },
  {
    name: 'quoted values after equals signs',
    commandLine: `chrome.exe --user-data-dir="${expectedProfile}" --remote-debugging-port="9333"`,
    expected: true,
    extensionsDisabled: false,
  },
  {
    name: 'quoted switches and separate quoted values',
    commandLine: `chrome.exe "--user-data-dir" "${expectedProfile}" "--remote-debugging-port" "9333"`,
    expected: true,
    extensionsDisabled: false,
  },
  {
    name: 'preserves a quote after an odd backslash run',
    commandLine: String.raw`chrome.exe --example="value\\\"still quoted" "--user-data-dir=${expectedProfile}" --remote-debugging-port=9333`,
    expected: true,
    expectedArgument: String.raw`--example=value\"still quoted`,
    extensionsDisabled: false,
  },
  {
    name: 'normalizes case and slash direction',
    commandLine: `chrome.exe --user-data-dir="c:/users/tester/AppData/Local/Google/Chrome/User Data/CodexCleanProfile" --remote-debugging-port=9333`,
    expected: true,
    extensionsDisabled: false,
  },
  {
    name: 'rejects a profile path with an extra suffix',
    commandLine: `chrome.exe "--user-data-dir=${expectedProfile}-other" --remote-debugging-port=9333`,
    expected: false,
    extensionsDisabled: false,
  },
  {
    name: 'rejects a port that only starts with 9333',
    commandLine: `chrome.exe "--user-data-dir=${expectedProfile}" --remote-debugging-port=93330`,
    expected: false,
    extensionsDisabled: false,
  },
  {
    name: 'rejects duplicate profile switches even when the first matches',
    commandLine: `chrome.exe "--user-data-dir=${expectedProfile}" "--user-data-dir=${expectedProfile}-other" --remote-debugging-port=9333`,
    expected: false,
    extensionsDisabled: false,
  },
  {
    name: 'rejects duplicate debugging-port switches even when the first matches',
    commandLine: `chrome.exe "--user-data-dir=${expectedProfile}" --remote-debugging-port=9333 --remote-debugging-port=93330`,
    expected: false,
    extensionsDisabled: false,
  },
  {
    name: 'rejects a Chrome renderer child that inherits the browser flags',
    commandLine: `chrome.exe "--user-data-dir=${expectedProfile}" --remote-debugging-port=9333 --type=renderer`,
    expected: false,
    extensionsDisabled: false,
  },
  {
    name: 'recognizes quoted extension-disabling switches',
    commandLine: `chrome.exe "--user-data-dir=${expectedProfile}" "--remote-debugging-port=9333" "--disable-extensions-except=C:\\test\\extension"`,
    expected: true,
    extensionsDisabled: true,
  },
];

test(
  'Chrome preflight parses quoted Windows arguments and keeps browser-root, profile, port, and extension gates exact',
  { skip: process.platform !== 'win32' ? 'Windows PowerShell is required.' : false },
  () => {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      parserMatch[1],
      '$fixtures = ConvertFrom-Json -InputObject $env:CGCSP_CHROME_PREFLIGHT_CASES',
      '$results = foreach ($case in $fixtures.cases) {',
      '    $arguments = @(ConvertFrom-WindowsCommandLine -CommandLine $case.commandLine)',
      '    [pscustomobject]@{',
      '        name = $case.name',
      '        arguments = $arguments',
      '        accepted = [bool](Test-ChromeBrowserRootArguments -Arguments $arguments -ExpectedDirectory $case.expectedProfile)',
      '        extensionsDisabled = [bool](Test-ChromeExtensionsDisabled -Arguments $arguments)',
      '    }',
      '}',
      'ConvertTo-Json -InputObject @($results) -Depth 5 -Compress',
    ].join('\n');
    const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
      {
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          CGCSP_CHROME_PREFLIGHT_CASES: JSON.stringify({
            cases: cases.map((item) => ({ ...item, expectedProfile })),
          }),
        },
      },
    );

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const actualResults = JSON.parse(result.stdout.trim());
    assert.equal(actualResults.length, cases.length, result.stdout);
    for (const [index, actual] of actualResults.entries()) {
      assert.equal(actual.name, cases[index].name);
      assert.equal(actual.accepted, cases[index].expected, cases[index].name);
      if (cases[index].expectedArgument)
        assert.ok(
          actual.arguments.includes(cases[index].expectedArgument),
          `Expected exact parsed argument ${cases[index].expectedArgument}`,
        );
      assert.equal(actual.extensionsDisabled, cases[index].extensionsDisabled, cases[index].name);
    }
  },
);
