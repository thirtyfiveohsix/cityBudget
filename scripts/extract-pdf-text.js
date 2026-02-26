import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/extract-pdf-text.js <pdf-path>');
  process.exit(1);
}

const buf = fs.readFileSync(path);
const out = await pdfParse(buf);
process.stdout.write(out.text || '');
