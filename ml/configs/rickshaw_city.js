// ml/configs/rickshaw_city.js
// Rickshaw, city rides. Covered three-wheeler, so weather barely dents demand
// (riders still take it in rain — unlike bikes). Distinct trait: CNG-shortage
// days reduce supply and push surge up. Low heat sensitivity (open but shaded).
import { rand, round, sampleWeather, sampleTime, sampleSupplyDemand } from "../lib/sampling.js";

export default {
    name: "rickshaw_city",
    scope: "city",
    featureSet: "city",
    vehicle: "rickshaw",
    fare: { base_fare: 90, per_km: 30, per_min: 3, min_fare: 130, max_surge: 2.5 },

    sampleRide() {
        // Rickshaws cover slightly longer typical trips than bikes, slower top speed.
        let distance_km;
        const r = Math.random();
        if (r < 0.5) distance_km = round(rand(1, 6));
        else if (r < 0.85) distance_km = round(rand(6, 14));
        else distance_km = round(rand(14, 25));

        const baseSpeed = rand(14, 26);
        const traffic_ratio = round(rand(1.0, 2.0));
        const travel_time_min = round((distance_km / baseSpeed) * 60 * traffic_ratio);
        const avg_speed_kmh = round(distance_km / (travel_time_min / 60));
        const wait_time_min = round(rand(1, 14));

        const { weather_code, rain_mm, visibility_m, wind_speed, feels_like_temp } = sampleWeather();
        const { hour, day, is_weekend, is_public_holiday, is_ramadan } = sampleTime("city");
        let { demand_ratio, zone_driver_count } = sampleSupplyDemand();

        // CNG-shortage day: ~10% of days, supply drops and surge rises.
        const cng_shortage = Math.random() < 0.1 ? 1 : 0;
        if (cng_shortage) zone_driver_count = Math.max(2, Math.round(zone_driver_count * 0.6));

        let surge = 1.0;

        // Demand
        surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * 0.08;

        // Traffic
        if (traffic_ratio >= 1.6) surge += 0.16;
        else if (traffic_ratio >= 1.35) surge += 0.09;
        else if (traffic_ratio >= 1.15) surge += 0.04;

        // Time of day
        if (hour >= 7 && hour <= 9) surge += 0.15;
        else if (hour >= 17 && hour <= 20) surge += 0.2;
        else if (hour >= 20 && hour <= 23) surge += 0.08;
        else if (hour >= 0 && hour <= 5) surge += 0.1;
        else surge -= 0.05;

        // Weather — near-neutral (covered cabin). Slight bump in heavy rain/storm
        // because road conditions slow supply, but no demand collapse like bikes.
        if (weather_code === 4) surge += 0.04;
        else if (weather_code === 5) surge += 0.08;
        else if (weather_code === 6)
            surge += 0.1; // fog
        else if (weather_code === 7) surge += 0.06; // dust

        // CNG shortage surcharge
        if (cng_shortage) surge += 0.22;

        // Mild heat sensitivity
        if (feels_like_temp > 46) surge -= 0.03;

        // Holiday / Ramadan
        if (is_public_holiday) surge += 0.1;
        if (is_ramadan && hour >= 16 && hour <= 19) surge += 0.22;

        // Low driver supply
        if (zone_driver_count < 5) surge += 0.2;
        else if (zone_driver_count < 10) surge += 0.09;

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
