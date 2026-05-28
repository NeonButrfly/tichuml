#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const patchFile = process.argv[2] || 'anchor_patch.json';
const root = process.argv[3] || '.';
const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
const files = patch.files || patch;
for (const [rel, data] of Object.entries(files)) {
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log('wrote', rel);
}
console.log('OK apply');
