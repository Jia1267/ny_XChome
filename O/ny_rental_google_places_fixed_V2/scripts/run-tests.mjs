import { readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function findTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findTests(fullPath);
    return entry.name.endsWith('.test.js') ? [fullPath] : [];
  }));
  return files.flat();
}

await rm('.test-dist', { recursive: true, force: true });
await run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json']);
await run(process.execPath, ['--test', ...(await findTests('.test-dist/tests'))]);
