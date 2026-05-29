// ml/data/generateBike.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── BIKE FARE CONFIG (Pakistan 2026) ───────────────────
const BIKE = { base_fare: 50, per_km: 22, per_min: 2, min_fare: 100, max_surge: 3.0 };

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const round = (n, d = 2) => +n.toFixed(d);

function generateBikeRide() {
  let distance_km;
  const r = Math.random();
  if (r < 0.55)      distance_km = round(rand(1, 5));
  else if (r < 0.85) distance_km = round(rand(5, 12));
  else               distance_km = round(rand(12, 20));

  const baseSpeed = rand(18, 32);
  let travel_time_min = round((distance_km / baseSpeed) * 60);
  const traffic_ratio = round(rand(1.0, 2.0));
  travel_time_min = round(travel_time_min * traffic_ratio);
  const avg_speed_kmh = round(distance_km / (travel_time_min / 60));
  let wait_time_min = round(rand(1, 12));

  const weather_code = randInt(0, 7);
  const rain_mm = weather_code >= 2 ? round(rand(0.5, 20)) : 0;
  const visibility_m = weather_code === 6 ? randInt(300, 1500)
                     : weather_code === 7 ? randInt(500, 2500)
                     : randInt(4000, 10000);
  const wind_speed = round(rand(0, 25));
  const feels_like_temp = round(rand(10, 48));

  const hour = randInt(0, 23);
  const day = randInt(0, 6);
  const is_weekend = day >= 5 ? 1 : 0;
  const is_public_holiday = Math.random() < 0.08 ? 1 : 0;
  const is_ramadan = Math.random() < 0.08 ? 1 : 0;

  let demand_ratio = round(rand(0.5, 5.0));
  let zone_driver_count = randInt(2, 40);

// ════════════════════════════════════════════════════════
  //  GROUND TRUTH SURGE MULTIPLIER (rebalanced)
  //  Most rides should be near 1.0, spikes should be rare
  // ════════════════════════════════════════════════════════

  let surge = 1.0;

  // --- 1. Demand effect (gentler curve) ---
  // demand_ratio 1.0 = balanced, 5.0 = extreme shortage
  surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * 0.08;

  // --- 2. Traffic effect (additive, small) ---
  if (traffic_ratio >= 1.6)       surge += 0.18;
  else if (traffic_ratio >= 1.35) surge += 0.10;
  else if (traffic_ratio >= 1.15) surge += 0.05;

  // --- 3. Time of day (additive, small) ---
  if (hour >= 7 && hour <= 9)        surge += 0.15;   // morning rush
  else if (hour >= 17 && hour <= 20) surge += 0.20;   // evening rush
  else if (hour >= 20 && hour <= 23) surge += 0.08;   // night
  else if (hour >= 0 && hour <= 5)   surge += 0.12;   // late night
  else                                surge -= 0.05;   // off-peak discount

  // --- 4. WEATHER — bike-specific reversal ---
  if (weather_code === 2)      { surge += 0.05; demand_ratio *= 0.9; }
  else if (weather_code === 3) { surge -= 0.05; demand_ratio *= 0.7; }
  else if (weather_code === 4) { surge -= 0.12; demand_ratio *= 0.5; }
  else if (weather_code === 5) { surge -= 0.18; demand_ratio *= 0.4; }
  else if (weather_code === 6) { surge += 0.12; }
  else if (weather_code === 7) { surge += 0.08; demand_ratio *= 0.6; }

  // --- 5. Wind — bike danger ---
  if (wind_speed > 20)      surge += 0.25;
  else if (wind_speed > 15) surge += 0.12;

  // --- 6. Extreme heat ---
  if (feels_like_temp > 45) surge -= 0.06;

  // --- 7. Holiday / Ramadan ---
  if (is_public_holiday) surge += 0.10;
  if (is_ramadan && (hour >= 16 && hour <= 19)) surge += 0.25; // iftar rush

  // --- 8. Low driver supply ---
  if (zone_driver_count < 5)       surge += 0.18;
  else if (zone_driver_count < 10) surge += 0.08;

  // --- Add small random noise (real-world variability) ---
  surge += rand(-0.04, 0.04);

  // --- Clamp to valid range ---
  surge = Math.max(0.80, Math.min(surge, BIKE.max_surge));
  surge = round(surge, 3);

  return {
    distance_km, travel_time_min, wait_time_min, traffic_ratio, avg_speed_kmh,
    weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp,
    demand_ratio: round(demand_ratio), zone_driver_count,
    hour, day, is_weekend, is_public_holiday, is_ramadan,
    surge_multiplier: surge,
  };
}

function generateDataset(size) {
  console.log(`Generating ${size} bike rides...`);
  const rows = [];
  for (let i = 0; i < size; i++) {
    rows.push(generateBikeRide());
    if ((i + 1) % 20000 === 0) console.log(`  ${i + 1} generated...`);
  }
  return rows;
}

function saveToCSV(rows, filepath) {
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => row[h]).join(','));
  fs.writeFileSync(filepath, lines.join('\n'));
  console.log(`Saved ${rows.length} rows to ${filepath}`);
}

const SIZE = 100000;
const outDir = path.join(__dirname, 'datasets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const dataset = generateDataset(SIZE);
saveToCSV(dataset, path.join(outDir, 'bike_city.csv'));

console.log('\n── Sample rows ──');
console.log('Clear weather, rush hour (surge should be ~1.2-1.5):');
console.log(dataset.find(r => r.weather_code === 0 && r.hour === 8));
console.log('\nHeavy rain (surge should be LOW, < 1.0 for bikes):');
console.log(dataset.find(r => r.weather_code === 4));
console.log('\nHigh wind > 20 (surge should be HIGH, > 1.3):');
console.log(dataset.find(r => r.wind_speed > 20));