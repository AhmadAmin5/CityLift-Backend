// ml/data/generator.js
// Generic, config-driven dataset generator.
//   node ml/data/generator.js <model_name> [size]
//   e.g. node ml/data/generator.js bike_city 100000
//
// Each config owns its vehicle-specific trip shape + surge physics via
// sampleRide(); this script just drives the loop and writes the CSV.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../configs/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const name = process.argv[2];
  const size = Number(process.argv[3]) || 100000;
  if (!name) {
    console.error('Usage: node ml/data/generator.js <model_name> [size]');
    process.exit(1);
  }

  const config = await getConfig(name);
  console.log(`Generating ${size} "${config.name}" rides (${config.scope})...`);

  const rows = [];
  for (let i = 0; i < size; i++) {
    rows.push(config.sampleRide());
    if ((i + 1) % 20000 === 0) console.log(`  ${i + 1} generated...`);
  }

  const outDir = path.join(__dirname, 'datasets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${config.name}.csv`);

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => row[h]).join(','));
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`Saved ${rows.length} rows to ${outPath}`);

  // Quick distribution sanity print (surge by a couple of conditions).
  const sIdx = headers.indexOf('surge_multiplier');
  const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3);
  const all = rows.map((r) => r.surge_multiplier);
  console.log(`\n── Surge summary ──`);
  console.log(`  mean=${avg(all)}  min=${Math.min(...all).toFixed(3)}  max=${Math.max(...all).toFixed(3)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
