const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ignoredDirectories = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules']);
const root = path.resolve(__dirname, '..', '..');
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

collect(root);
files.sort();

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  } catch (_error) {
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.info(`JavaScript syntax check passed (${files.length} application files; generated and dependency directories excluded).`);
}
