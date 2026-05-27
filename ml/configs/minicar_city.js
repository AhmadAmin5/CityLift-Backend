// ml/configs/minicar_city.js
// Mini car, city rides. Classic enclosed-car behavior — the OPPOSITE of bikes:
// rain RAISES demand/surge (people abandon bikes/rickshaws for a dry car), and
// extreme heat RAISES surge (AC demand). Strong rush-hour peaks.
import { rand, round, sampleWeather, sampleTime, sampleSupplyDemand } from '../lib/sampling.js';

export default {
  name: 'minicar_city',
  scope: 'city',
  featureSet: 'city',
  vehicle: 'minicar',
  fare: { base_fare: 120, per_km: 38, per_min: 4, min_fare: 200, max_surge: 2.5 },

  sampleRide() {
    let distance_km;
    const r = Math.random();
    if (r < 0.45)      distance_km = round(rand(2, 8));
    else if (r < 0.8)  distance_km = round(rand(8, 18));
    else               distance_km = round(rand(18, 35));

    const baseSpeed = rand(20, 40);
    const traffic_ratio = round(rand(1.0, 2.0));
    const travel_time_min = round(((distance_km / baseSpeed) * 60) * traffic_ratio);
    const avg_speed_kmh = round(distance_km / (travel_time_min / 60));
    const wait_time_min = round(rand(2, 15));

    const { weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp } = sampleWeather();
    const { hour, day, is_weekend, is_public_holiday, is_ramadan } = sampleTime('city');
    let { demand_ratio, zone_driver_count } = sampleSupplyDemand();

    let surge = 1.0;

    // Demand
    surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * 0.09;

    // Traffic
    if (traffic_ratio >= 1.6)       surge += 0.20;
    else if (traffic_ratio >= 1.35) surge += 0.12;
    else if (traffic_ratio >= 1.15) surge += 0.06;

    // Time of day — strong commute peaks
    if (hour >= 7 && hour <= 9)        surge += 0.22;
    else if (hour >= 17 && hour <= 20) surge += 0.28;
    else if (hour >= 20 && hour <= 23) surge += 0.10;
    else if (hour >= 0 && hour <= 5)   surge += 0.12;
    else                                surge -= 0.05;

    // Weather — car reversal: rain RAISES surge (demand surges to dry transport)
    if (weather_code === 2)      { surge += 0.06; demand_ratio *= 1.10; }
    else if (weather_code === 3) { surge += 0.14; demand_ratio *= 1.25; }
    else if (weather_code === 4) { surge += 0.24; demand_ratio *= 1.5; }
    else if (weather_code === 5) { surge += 0.30; demand_ratio *= 1.7; }
    else if (weather_code === 6) { surge += 0.14; } // fog — fewer drivers
    else if (weather_code === 7) { surge += 0.10; } // dust

    // Extreme heat — AC demand raises surge (opposite of bikes)
    if (feels_like_temp > 45)      surge += 0.12;
    else if (feels_like_temp > 40) surge += 0.05;

    // Holiday / Ramadan
    if (is_public_holiday) surge += 0.12;
    if (is_ramadan && hour >= 16 && hour <= 19) surge += 0.22;

    // Low driver supply
    if (zone_driver_count < 5)       surge += 0.20;
    else if (zone_driver_count < 10) surge += 0.10;

    surge += rand(-0.04, 0.04);
    surge = round(Math.max(0.85, Math.min(surge, this.fare.max_surge)), 3);

    return {
      distance_km, travel_time_min, wait_time_min, traffic_ratio, avg_speed_kmh,
      weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp,
      demand_ratio: round(demand_ratio), zone_driver_count,
      hour, day, is_weekend, is_public_holiday, is_ramadan,
      surge_multiplier: surge,
    };
  },
};
