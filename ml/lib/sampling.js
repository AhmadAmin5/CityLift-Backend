// ml/lib/sampling.js
// Shared random samplers used by every vehicle config so that the common
// environment (weather, time, supply/demand) is generated identically across
// models. Vehicle-specific physics (trip shape + surge rules) live in configs.

export const rand = (min, max) => Math.random() * (max - min) + min;
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const round = (n, d = 2) => +n.toFixed(d);

// ─── Weather ──────────────────────────────────────────────
// weather_code legend (shared across all models):
//   0 Clear · 1 Cloudy · 2 LightRain · 3 ModRain · 4 HeavyRain
//   5 Storm · 6 Fog · 7 Dust
export function sampleWeather() {
  const weather_code = randInt(0, 7);
  const rain_mm = weather_code >= 2 && weather_code <= 5 ? round(rand(0.5, 20)) : 0;
  const visibility_m =
    weather_code === 6 ? randInt(300, 1500) :
    weather_code === 7 ? randInt(500, 2500) :
    randInt(4000, 10000);
  const wind_speed = round(rand(0, 25));
  const feels_like_temp = round(rand(10, 48));
  return { weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp };
}

// ─── Time context ─────────────────────────────────────────
// scope 'intercity' also samples a month (strong seasonality for long trips).
export function sampleTime(scope = 'city') {
  const hour = randInt(0, 23);
  const day = randInt(0, 6);
  const month = randInt(0, 11);
  const is_weekend = day >= 5 ? 1 : 0;
  const is_public_holiday = Math.random() < 0.08 ? 1 : 0;
  const is_ramadan = Math.random() < 0.08 ? 1 : 0;
  const base = { hour, day, is_weekend, is_public_holiday, is_ramadan };
  return scope === 'intercity' ? { ...base, month } : base;
}

// ─── Supply / demand ──────────────────────────────────────
export function sampleSupplyDemand() {
  return {
    demand_ratio: round(rand(0.5, 5.0)),
    zone_driver_count: randInt(2, 40),
  };
}
