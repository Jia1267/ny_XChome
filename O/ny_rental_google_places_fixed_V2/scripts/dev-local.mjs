import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

const PORT = 5503;
const LOCAL_URL = `http://localhost:${PORT}`;

function serverResponds() {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/',
      timeout: 1200
    }, (response) => {
      response.resume();
      resolve(true);
    });

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function main() {
  if (await serverResponds()) {
    console.log(`NY Rental Map V2 is already running at ${LOCAL_URL}`);
    console.log('Refresh the browser tab, or stop the existing server before starting another one.');
    return;
  }

  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: false
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
