// ml/prediction/testPredict.js
// End-to-end check of the serving layer: loads each trained model and runs a
// couple of hand-built scenarios, printing surge + fare. Also serves as a
// usage example for the backend.
//   node ml/prediction/testPredict.js
import { predictSurge, estimateFare } from "./predictor.js";

// Cyclical raw fields are plain numbers here; buildFeatureRow does sin/cos.
const cityBase = {
    distance_km: 8,
    travel_time_min: 25,
    wait_time_min: 6,
    traffic_ratio: 1.4,
    avg_speed_kmh: 19,
    weather_code: 0,
    rain_mm: 0,
    visibility_m: 6000,
    wind_speed: 5,
    feels_like_temp: 25,
    demand_ratio: 3.5,
    zone_driver_count: 8,
    hour: 8,
    day: 1,
    is_weekend: 0,
    is_public_holiday: 0,
    is_ramadan: 0
};

const rain = { ...cityBase, weather_code: 4, rain_mm: 12, demand_ratio: 2.0 };

const intercityBase = {
    distance_km: 375,
    travel_time_min: 300,
    traffic_ratio: 1.1,
    avg_speed_kmh: 75,
    weather_code: 0,
    rain_mm: 0,
    visibility_m: 8000,
    wind_speed: 6,
    feels_like_temp: 28,
    dest_weather_code: 1,
    dest_rain_mm: 0,
    demand_ratio: 2.5,
    zone_driver_count: 10,
    booking_lead_time_hours: 24,
    toll_cost: 1000,
    dead_return_factor: 1.3,
    seats_booked: 2,
    seat_capacity: 4,
    hour: 9,
    day: 5,
    month: 5,
    is_weekend: 1,
    is_public_holiday: 0,
    is_ramadan: 0,
    cancellation_risk: 0.1
};

async function main() {
    console.log("── City: clear, 8am rush, high demand ──");
    for (const v of ["bike", "rickshaw", "minicar", "economy", "parcel"]) {
        console.log(`  ${v.padEnd(9)}`, await estimateFare(v, "city", cityBase));
    }

    console.log("\n── City: heavy rain (bike should DROP, cars should RISE) ──");
    for (const v of ["bike", "minicar", "economy"]) {
        console.log(`  ${v.padEnd(9)} surge=`, await predictSurge(v, "city", rain));
    }

    console.log("\n── Intercity: Lahore→Islamabad weekend, 24h lead ──");
    for (const v of ["minicar", "economy", "parcel"]) {
        console.log(`  ${v.padEnd(9)}`, await estimateFare(v, "intercity", intercityBase));
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
