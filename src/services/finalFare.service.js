import mongoose from "mongoose";
import { prisma } from "../db/postgres.js";
import { getTimeFeatures } from "../utils/timeFeatures.js";
import { resolveMlScope } from "../utils/vehicleMapper.js";
import { predictRideSurge } from "./mlPrediction.service.js";
import { getDemandSupplyForPickup } from "./demandSupply.service.js";
import WeatherUpdate from "../models/weatherUpdate.model.js";
import logger from "../utils/logger.js";

/**
 * Aggregates periodic ride tracking telemetry and weather data for a ride.
 * @param {string} rideId - The UUID of the ride.
 * @returns {Promise<object|null>} Aggregated weather and demandSupply data, or null.
 */
export async function aggregateRideTrackingData(rideId) {
    if (mongoose.connection.readyState !== 1) {
        logger.warn("[FINAL_FARE] MongoDB not connected, skipping tracking aggregation.");
        return null;
    }

    const points = await mongoose.connection.collection("ride_tracking").find({ ride_id: rideId }).toArray();

    if (!points || points.length === 0) {
        logger.info(`[FINAL_FARE] No tracking points found in MongoDB for ride: ${rideId}`);
        return null;
    }

    let weather_code_sum = 0;
    let rain_mm_sum = 0;
    let visibility_m_sum = 0;
    let wind_speed_sum = 0;
    let feels_like_temp_sum = 0;
    let demand_ratio_sum = 0;
    let zone_driver_count_sum = 0;

    let weatherCount = 0;
    let demandCount = 0;

    for (const pt of points) {
        if (pt.weather_code !== undefined && pt.weather_code !== null) {
            weather_code_sum += Number(pt.weather_code);
            rain_mm_sum += Number(pt.rain_mm || 0);
            visibility_m_sum += Number(pt.visibility_m || 10000);
            wind_speed_sum += Number(pt.wind_speed || 5);
            feels_like_temp_sum += Number(pt.feels_like_temp || 30);
            weatherCount++;
        }
        if (pt.demand_ratio !== undefined && pt.demand_ratio !== null) {
            demand_ratio_sum += Number(pt.demand_ratio);
            zone_driver_count_sum += Number(pt.zone_driver_count || 1);
            demandCount++;
        }
    }

    return {
        weather:
            weatherCount > 0
                ? {
                      weather_code: Math.round(weather_code_sum / weatherCount),
                      rain_mm: rain_mm_sum / weatherCount,
                      visibility_m: visibility_m_sum / weatherCount,
                      wind_speed: wind_speed_sum / weatherCount,
                      feels_like_temp: feels_like_temp_sum / weatherCount
                  }
                : null,
        demandSupply:
            demandCount > 0
                ? {
                      demand_ratio: demand_ratio_sum / demandCount,
                      zone_driver_count: zone_driver_count_sum / demandCount
                  }
                : null
    };
}

/**
 * Constructs the raw input object for the ML surge prediction model using actual trip values.
 */
export function buildFinalRawInput({ ride, tripParams, weather, demandSupply, timeFeatures }) {
    const distanceKm = Number(tripParams.actual_distance_km || 0);
    const travelTimeMin = Number(tripParams.actual_duration_min || 0);
    const trafficDelayMin = Number(tripParams.actual_traffic_delay_min || 0);

    const normalDurationMin = Math.max(1, travelTimeMin - trafficDelayMin);
    const trafficRatio = travelTimeMin / normalDurationMin;

    const avgSpeedKmh = travelTimeMin > 0 ? distanceKm / (travelTimeMin / 60) : 0;

    return {
        distance_km: distanceKm,
        travel_time_min: travelTimeMin,
        wait_time_min: Number(tripParams.waiting_time_min || 0),

        traffic_ratio: Number.isFinite(trafficRatio) ? trafficRatio : 1,
        avg_speed_kmh: Number.isFinite(avgSpeedKmh) ? avgSpeedKmh : 0,

        weather_code: Number(weather.weather_code ?? 0),
        rain_mm: Number(weather.rain_mm ?? 0),
        visibility_m: Number(weather.visibility_m ?? 10000),
        wind_speed: Number(weather.wind_speed ?? 5),
        feels_like_temp: Number(weather.feels_like_temp ?? 30),

        demand_ratio: Number(demandSupply.demand_ratio ?? 1),
        zone_driver_count: Number(demandSupply.zone_driver_count ?? 1),

        hour: Number(timeFeatures.hour),
        day: Number(timeFeatures.day),
        is_weekend: Number(timeFeatures.is_weekend),
        is_public_holiday: Number(timeFeatures.is_public_holiday),
        is_ramadan: Number(timeFeatures.is_ramadan)
    };
}

/**
 * Main orchestrator to calculate final fare based on actual ride conditions, ML surge prediction,
 * and threshold capping.
 */
export async function calculateFinalFare({ ride, tripParams, vehicleType }) {
    const pricing = {
        base_fare: Number(ride.fare?.baseFare ?? 100),
        per_km_rate: Number(ride.fare?.perKmRate ?? 40),
        per_min_rate: Number(ride.fare?.perMinRate ?? 8),
        waiting_per_min_rate: Number(ride.fare?.waitingPerMinRate ?? 5),
        traffic_delay_per_min_rate: Number(ride.fare?.trafficDelayPerMinRate ?? 4),
        minimum_fare: Number(ride.fare?.minimumFare ?? 250),
        peak_multiplier: Number(ride.fare?.peakMultiplier ?? 1.0)
    };

    const timeFeatures = getTimeFeatures(ride.startedAt || ride.createdAt);

    // 1. Gather weather & demand data (aggregated from tracking telemetry with fallbacks)
    let aggregatedData = await aggregateRideTrackingData(ride.id).catch((err) => {
        logger.error(`[FINAL_FARE] Error aggregating tracking data: ${err.message}`);
        return null;
    });

    let weather = aggregatedData?.weather;
    if (!weather) {
        try {
            const lastWeather = await WeatherUpdate.findOne({ ride_id: ride.id })
                .sort({ timestamp: -1 })
                .lean();
            if (lastWeather) {
                weather = {
                    weather_code: lastWeather.weather_code,
                    rain_mm: lastWeather.rain_mm,
                    visibility_m: lastWeather.visibility_m,
                    wind_speed: lastWeather.wind_speed,
                    feels_like_temp: lastWeather.feels_like_temp
                };
            }
        } catch (weatherErr) {
            logger.error(`[FINAL_FARE] Failed to fetch fallback weather: ${weatherErr.message}`);
        }
    }
    if (!weather) {
        weather = {
            weather_code: 0,
            rain_mm: 0,
            visibility_m: 10000,
            wind_speed: 5,
            feels_like_temp: 30
        };
    }

    let demandSupply = aggregatedData?.demandSupply;
    if (!demandSupply) {
        try {
            const dsResult = await getDemandSupplyForPickup({
                latitude: Number(ride.pickupLatitude),
                longitude: Number(ride.pickupLongitude)
            });
            demandSupply = {
                demand_ratio: dsResult.demand_ratio,
                zone_driver_count: dsResult.zone_driver_count
            };
        } catch (dsErr) {
            logger.error(`[FINAL_FARE] Failed to fetch fallback demand/supply: ${dsErr.message}`);
        }
    }
    if (!demandSupply) {
        demandSupply = {
            demand_ratio: 1.0,
            zone_driver_count: 1
        };
    }

    // 2. Build ML raw input object
    const rawInput = buildFinalRawInput({ ride, tripParams, weather, demandSupply, timeFeatures });

    // Validate rawInput values to ensure they are finite numbers
    for (const [key, val] of Object.entries(rawInput)) {
        if (typeof val !== "number" || !Number.isFinite(val)) {
            rawInput[key] = 0;
        }
    }

    // 3. Predict final surge multiplier using ML model
    const scope = resolveMlScope();
    const mlResult = await predictRideSurge({
        vehicleType,
        scope,
        rawInput
    });

    const mlSurgeMultiplier = mlResult.surge_multiplier;

    // 4. Compute formula components
    const base_fare = pricing.base_fare;
    const distance_fare_amount = Math.round(Number(tripParams.actual_distance_km || 0) * pricing.per_km_rate);
    const duration_fare_amount = Math.round(
        Number(tripParams.actual_duration_min || 0) * pricing.per_min_rate
    );
    const waiting_fare_amount = Math.round(
        Number(tripParams.waiting_time_min || 0) * pricing.waiting_per_min_rate
    );
    const traffic_delay_fare_amount = Math.round(
        Number(tripParams.actual_traffic_delay_min || 0) * pricing.traffic_delay_per_min_rate
    );

    const subtotal =
        base_fare +
        distance_fare_amount +
        duration_fare_amount +
        waiting_fare_amount +
        traffic_delay_fare_amount;
    const peak_multiplier = pricing.peak_multiplier;
    const peak_amount = Math.round(subtotal * (peak_multiplier - 1));

    const originalSurgeMultiplier = Number(ride.fare?.surgeMultiplier ?? 1.0);

    // Compute standard formula fare (using pre-ride/original surge multiplier)
    const finalFormulaFare = Math.round(
        Math.max(pricing.minimum_fare, (subtotal + peak_amount) * originalSurgeMultiplier)
    );

    // Compute ML predicted fare (using actual ride surge multiplier prediction)
    const finalMlPredictedFare = Math.round(
        Math.max(pricing.minimum_fare, (subtotal + peak_amount) * mlSurgeMultiplier)
    );

    // 5. Apply threshold capping against pre-ride estimated fare
    const estimatedFare = Number(
        ride.fare?.preRideMlPredictedFare || ride.fare?.preRideFormulaFare || pricing.minimum_fare
    );

    // Configurable threshold (default 20%)
    const thresholdPercent = process.env.FARE_THRESHOLD_PERCENT
        ? parseFloat(process.env.FARE_THRESHOLD_PERCENT)
        : 0.2;

    const lowerBound = Math.max(pricing.minimum_fare, estimatedFare * (1 - thresholdPercent));
    const upperBound = estimatedFare * (1 + thresholdPercent);

    // Clamp the final fare between lowerBound and upperBound
    const finalFare = Math.round(Math.max(lowerBound, Math.min(finalMlPredictedFare, upperBound)));
    const threshold_adjustment = Math.round(finalMlPredictedFare - finalFare);

    const breakdown = {
        base_fare,
        distance_fare: {
            rate: pricing.per_km_rate,
            distance_km: Number(tripParams.actual_distance_km || 0),
            amount: distance_fare_amount
        },
        duration_fare: {
            rate: pricing.per_min_rate,
            duration_min: Number(tripParams.actual_duration_min || 0),
            amount: duration_fare_amount
        },
        waiting_fare: {
            rate: pricing.waiting_per_min_rate,
            waiting_min: Number(tripParams.waiting_time_min || 0),
            amount: waiting_fare_amount
        },
        traffic_delay_fare: {
            rate: pricing.traffic_delay_per_min_rate,
            delay_min: Number(tripParams.actual_traffic_delay_min || 0),
            amount: traffic_delay_fare_amount
        },
        subtotal,
        peak_multiplier,
        peak_amount,
        surge_multiplier: mlSurgeMultiplier,
        surge_amount: Math.round((subtotal + peak_amount) * (mlSurgeMultiplier - 1)),
        pre_adjustment_total: finalMlPredictedFare,
        threshold_adjustment,
        final_fare: finalFare,
        estimated_fare: estimatedFare,
        currency: ride.fare?.currency || "PKR"
    };

    return {
        final_fare: finalFare,
        final_formula_fare: finalFormulaFare,
        final_ml_predicted_fare: finalMlPredictedFare,
        model_used: mlResult.model_used,
        surge_multiplier: mlSurgeMultiplier,
        breakdown,
        raw_input: rawInput,
        ml_available: mlResult.ml_available
    };
}
