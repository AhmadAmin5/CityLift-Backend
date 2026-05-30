// Average surge by weather condition (the real test)
import fs from 'fs';
const lines = fs.readFileSync('./datasets/bike_city.csv', 'utf8').trim().split('\n');
const headers = lines[0].split(',');
const wIdx = headers.indexOf('weather_code');
const sIdx = headers.indexOf('surge_multiplier');
const windIdx = headers.indexOf('wind_speed');

const byWeather = {};
const windHigh = [], windLow = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const w = cols[wIdx], s = parseFloat(cols[sIdx]), wind = parseFloat(cols[windIdx]);
  (byWeather[w] = byWeather[w] || []).push(s);
  if (wind > 20) windHigh.push(s); else windLow.push(s);
}

const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3);
const names = ['Clear','Cloudy','LightRain','ModRain','HeavyRain','Storm','Fog','Dust'];

console.log('\n── Avg surge by weather (isolates weather effect) ──');
Object.keys(byWeather).sort().forEach(w =>
  console.log(`  ${names[w].padEnd(10)} → ${avg(byWeather[w])}  (n=${byWeather[w].length})`));

console.log('\n── Wind effect ──');
console.log(`  Wind > 20  → ${avg(windHigh)}`);
console.log(`  Wind <= 20 → ${avg(windLow)}`);