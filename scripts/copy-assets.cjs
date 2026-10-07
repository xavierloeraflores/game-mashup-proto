const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const directory of ['registry', 'ui']) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(root, 'dist', directory), { recursive: true });
}
