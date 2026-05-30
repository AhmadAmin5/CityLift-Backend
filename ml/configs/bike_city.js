// ml/configs/bike_city.js
// Bike, city rides. Surge physics ported verbatim from the original
// generateBike.js so the refactored pipeline reproduces the existing model.
// Key bike trait: rain REDUCES demand/surge (riders avoid bikes in rain),
// while high wind RAISES surge (riding becomes dangerous → fewer drivers).
import { rand, round, sampleWeather, sampleTime, sampleSupplyDemand } from '../lib/sampling.js';

export default {
  name: 'bike_city',
  scope: 'city',
  featureSet: 'city',
  vehicle: 'bike',
  fare: { base_fare: 50, per_km: 22, per_min: 2, min_fare: 100, max_surge: 3.0 },

  sampleRide() {
    // ─── Trip shape: bikes skew short ───
    let distance_km;
    const r = Math.random();
    if (r < 0.55)      distance_km = round(rand(1, 5));
    else if (r < 0.85) distance_km = round(rand(5, 12));
    else               distance_km = round(rand(12, 20));

    const baseSpeed = rand(18, 32);
    const traffic_ratio = round(rand(1.0, 2.0));
    const travel_time_min = round(((distance_km / baseSpeed) * 60) * traffic_ratio);
    const avg_speed_kmh = round(distance_km / (travel_time_min / 60));
    const wait_time_min = round(rand(1, 12));

    const { weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp } = sampleWeather();
    const { hour, day, is_weekend, is_public_holiday, is_ramadan } = sampleTime('city');
    let { demand_ratio, zone_driver_count } = sampleSupplyDemand();

    // ─── Ground-truth surge multiplier ───
    let surge = 1.0;

    // 1. Demand effect (gentle curve)
    surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * 0.08;

    // 2. Traffic
    if (traffic_ratio >= 1.6)       surge += 0.18;
    else if (traffic_ratio >= 1.35) surge += 0.10;
    else if (traffic_ratio >= 1.15) surge += 0.05;

    // 3. Time of day
    if (hour >= 7 && hour <= 9)        surge += 0.15;
    else if (hour >= 17 && hour <= 20) surge += 0.20;
    else if (hour >= 20 && hour <= 23) surge += 0.08;
    else if (hour >= 0 && hour <= 5)   surge += 0.12;
    else                                surge -= 0.05;

    // 4. Weather — bike-specific reversal (rain suppresses bike demand)
    if (weather_code === 2)      { surge += 0.05; demand_ratio *= 0.9; }
    else if (weather_code === 3) { surge -= 0.05; demand_ratio *= 0.7; }
    else if (weather_code === 4) { surge -= 0.12; demand_ratio *= 0.5; }
    else if (weather_code === 5) { surge -= 0.18; demand_ratio *= 0.4; }
    else if (weather_code === 6) { surge += 0.12; }
    else if (weather_code === 7) { surge += 0.08; demand_ratio *= 0.6; }

    // 5. Wind — bike danger
    if (wind_speed > 20)      surge += 0.25;
    else if (wind_speed > 15) surge += 0.12;

    // 6. Extreme heat
    if (feels_like_temp > 45) surge -= 0.06;

    // 7. Holiday / Ramadan
    if (is_public_holiday) surge += 0.10;
    if (is_ramadan && hour >= 16 && hour <= 19) surge += 0.25; // iftar rush

    // 8. Low driver supply
    if (zone_driver_count < 5)       surge += 0.18;
    else if (zone_driver_count < 10) surge += 0.08;

    // Real-world noise + clamp
    surge += rand(-0.04, 0.04);
    surge = round(Math.max(0.80, Math.min(surge, this.fare.max_surge)), 3);

    return {
      distance_km, travel_time_min, wait_time_min, traffic_ratio, avg_speed_kmh,
      weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp,
      demand_ratio: round(demand_ratio), zone_driver_count,
      hour, day, is_weekend, is_public_holiday, is_ramadan,
      surge_multiplier: surge,
    };
  },
};
