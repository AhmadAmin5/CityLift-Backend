// ml/configs/economy_city.js
// Economy car, city rides. Same enclosed-car physics as mini car (rain & heat
// RAISE surge), but a premium tier: longer typical trips, slightly stronger
// commute peaks, and a touch more demand elasticity.
import { rand, round, sampleWeather, sampleTime, sampleSupplyDemand } from "../lib/sampling.js";

export default {
    name: "economy_city",
    scope: "city",
    featureSet: "city",
    vehicle: "economy",
    fare: { base_fare: 150, per_km: 52, per_min: 5, min_fare: 250, max_surge: 2.5 },

    sampleRide() {
        let distance_km;
        const r = Math.random();
        if (r < 0.4) distance_km = round(rand(2, 10));
        else if (r < 0.78) distance_km = round(rand(10, 22));
        else distance_km = round(rand(22, 40));

        const baseSpeed = rand(22, 42);
        const traffic_ratio = round(rand(1.0, 2.0));
        const travel_time_min = round((distance_km / baseSpeed) * 60 * traffic_ratio);
        const avg_speed_kmh = round(distance_km / (travel_time_min / 60));
        const wait_time_min = round(rand(2, 16));

        const { weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp } = sampleWeather();
        const { hour, day, is_weekend, is_public_holiday, is_ramadan } = sampleTime("city");
        let { demand_ratio, zone_driver_count } = sampleSupplyDemand();

        let surge = 1.0;

        // Demand (slightly more elastic than mini)
        surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * 0.1;

        // Traffic
        if (traffic_ratio >= 1.6) surge += 0.22;
        else if (traffic_ratio >= 1.35) surge += 0.13;
        else if (traffic_ratio >= 1.15) surge += 0.07;

        // Time of day — strong commute peaks
        if (hour >= 7 && hour <= 9) surge += 0.24;
        else if (hour >= 17 && hour <= 20) surge += 0.3;
        else if (hour >= 20 && hour <= 23) surge += 0.11;
        else if (hour >= 0 && hour <= 5) surge += 0.13;
        else surge -= 0.05;

        // Weather — car reversal: rain RAISES surge
        if (weather_code === 2) {
            surge += 0.07;
            demand_ratio *= 1.1;
        } else if (weather_code === 3) {
            surge += 0.15;
            demand_ratio *= 1.25;
        } else if (weather_code === 4) {
            surge += 0.26;
            demand_ratio *= 1.5;
        } else if (weather_code === 5) {
            surge += 0.32;
            demand_ratio *= 1.7;
        } else if (weather_code === 6) {
            surge += 0.15;
        } else if (weather_code === 7) {
            surge += 0.11;
        }

        // Extreme heat — AC demand
        if (feels_like_temp > 45) surge += 0.13;
        else if (feels_like_temp > 40) surge += 0.06;

        // Holiday / Ramadan
        if (is_public_holiday) surge += 0.13;
        if (is_ramadan && hour >= 16 && hour <= 19) surge += 0.22;

        // Low driver supply
        if (zone_driver_count < 5) surge += 0.21;
        else if (zone_driver_count < 10) surge += 0.1;

        surge += rand(-0.04, 0.04);
        surge = round(Math.max(0.85, Math.min(surge, this.fare.max_surge)), 3);

        return {
            distance_km,
            travel_time_min,
            wait_time_min,
            traffic_ratio,
            avg_speed_kmh,
            weather_code,
            rain_mm,
            visibility_m,
            wind_speed,
            feels_like_temp,
            demand_ratio: round(demand_ratio),
            zone_driver_count,
            hour,
            day,
            is_weekend,
            is_public_holiday,
            is_ramadan,
            surge_multiplier: surge
        };
    }
};
