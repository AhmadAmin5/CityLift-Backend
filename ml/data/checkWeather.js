// ml/data/checkWeather.js
// Quick physics check for any generated dataset: average surge by weather code.
//   node ml/data/checkWeather.js <model_name>
// Use it to confirm each vehicle's weather direction (bikes: rain lowers surge;
// cars: rain raises it; parcel: roughly flat).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('Usage: node ml/data/checkWeather.js <model_name>');
  process.exit(1);
}

const csvPath = path.join(__dirname, 'datasets', `${name}.csv`);
const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const headers = lines[0].split(',');
const wIdx = headers.indexOf('weather_code');
const sIdx = headers.indexOf('surge_multiplier');

const byWeather = {};
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const w = cols[wIdx];
  (byWeather[w] = byWeather[w] || []).push(parseFloat(cols[sIdx]));
}

const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3);
const names = ['Clear', 'Cloudy', 'LightRain', 'ModRain', 'HeavyRain', 'Storm', 'Fog', 'Dust'];

console.log(`\n── ${name}: avg surge by weather ──`);
Object.keys(byWeather).sort((a, b) => a - b).forEach((w) =>
  console.log(`  ${names[w].padEnd(10)} → ${avg(byWeather[w])}  (n=${byWeather[w].length})`)
);
