// ml/configs/parcel_city.js
// Parcel delivery, city. Goods don't care about comfort, so demand is largely
// WEATHER-INSENSITIVE. Surge is driven by distance, logistics time-of-day peaks
// (business hours, lunch/evening commerce), and rider supply. Mild storm bump
// only because severe weather slows riders, not because demand changes.
import { rand, round, sampleWeather, sampleTime, sampleSupplyDemand } from "../lib/sampling.js";

export default {
    name: "parcel_city",
    scope: "city",
    featureSet: "city",
    vehicle: "parcel",
    fare: { base_fare: 60, per_km: 25, per_min: 1, min_fare: 90, max_surge: 2.5 },

    sampleRide() {
        let distance_km;
        const r = Math.random();
        if (r < 0.5) distance_km = round(rand(1, 6));
        else if (r < 0.85) distance_km = round(rand(6, 15));
        else distance_km = round(rand(15, 28));

        const baseSpeed = rand(18, 34);
        const traffic_ratio = round(rand(1.0, 2.0));
        const travel_time_min = round((distance_km / baseSpeed) * 60 * traffic_ratio);
        const avg_speed_kmh = round(distance_km / (travel_time_min / 60));
        const wait_time_min = round(rand(1, 10)); // pickup handover

        const { weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp } = sampleWeather();
        const { hour, day, is_weekend, is_public_holiday, is_ramadan } = sampleTime("city");
        let { demand_ratio, zone_driver_count } = sampleSupplyDemand();

        let surge = 1.0;

        // Demand
        surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * 0.07;

        // Traffic (matters — late delivery)
        if (traffic_ratio >= 1.6) surge += 0.16;
        else if (traffic_ratio >= 1.35) surge += 0.09;
        else if (traffic_ratio >= 1.15) surge += 0.04;

        // Time of day — logistics/commerce pattern (business + evening), not commute
        if (hour >= 10 && hour <= 14)
            surge += 0.14; // daytime commerce peak
        else if (hour >= 18 && hour <= 21)
            surge += 0.18; // evening orders
        else if (hour >= 0 && hour <= 6)
            surge -= 0.08; // dead hours, cheap
        else surge += 0.02;

        // Weather — INSENSITIVE for demand; only a small supply-side bump in severe
        if (weather_code === 5)
            surge += 0.08; // storm slows riders
        else if (weather_code === 6) surge += 0.06; // fog

        // No meaningful heat effect for parcels.

        // Holiday / Ramadan — commerce shifts but no iftar spike for goods
        if (is_public_holiday) surge += 0.06;

        // Low rider supply
        if (zone_driver_count < 5) surge += 0.18;
        else if (zone_driver_count < 10) surge += 0.08;

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
