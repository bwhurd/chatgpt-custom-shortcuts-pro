import process from 'node:process';
import { spawn } from 'node:child_process';

export async function focusCodexWindow() {
    if (process.platform !== 'win32') return;

    const script = `
try {
  $wshell = New-Object -ComObject WScript.Shell
  $titles = @('Codex', 'OpenAI Codex', 'ChatGPT Custom Shortcuts Pro')
  foreach ($title in $titles) {
    if ($wshell.AppActivate($title)) { exit 0 }
  }
  exit 0
} catch {
  exit 0
}
`;

    await new Promise((resolve) => {
        const child = spawn(
            'powershell',
            ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
            { stdio: 'ignore' },
        );
        child.on('exit', () => resolve());
        child.on('error', () => resolve());
    });
}
