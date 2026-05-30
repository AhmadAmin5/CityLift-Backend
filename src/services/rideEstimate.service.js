import { getRoutePreview } from "./googleRoutes.service.js";
import { getCurrentWeather, getDefaultWeather } from "./openWeather.service.js";
import { getDemandSupplyForPickup, getDefaultDemandSupply } from "./demandSupply.service.js";
import { getTimeFeatures } from "../utils/timeFeatures.js";
import { resolveMlScope, mapApiVehicleToMlVehicle } from "../utils/vehicleMapper.js";
import { predictRideSurge } from "./mlPrediction.service.js";
import { getPricingRule, getPeakMultiplier, calculateFareEstimate } from "./pricing.service.js";
import ApiError from "../utils/ApiError.js";
import mongoose from "mongoose";

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const validateCoordinate = (location, fieldName) => {
    if (!location || !isFiniteNumber(location.latitude) || !isFiniteNumber(location.longitude)) {
        throw new ApiError(400, `${fieldName} latitude and longitude are required`);
    }

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new ApiError(400, `${fieldName} coordinates are invalid`);
    }

    return { latitude, longitude };
};

const normalizeStops = (stops = []) => {
    if (!Array.isArray(stops)) {
        return [];
    }

    return stops
        .filter((stop) => stop && isFiniteNumber(stop.latitude) && isFiniteNumber(stop.longitude))
        .map((stop) => ({
            stop_order: Number.isFinite(Number(stop.stop_order)) ? Number(stop.stop_order) : 0,
            latitude: Number(stop.latitude),
            longitude: Number(stop.longitude),
            address: stop.address || null,
            provider: stop.provider || null,
            provider_place_id: stop.provider_place_id || null
        }))
        .sort((a, b) => a.stop_order - b.stop_order);
};

export function validateEstimatePayload(payload) {
    const { ride_type, scheduled_pickup_at, vehicle_type = "car", pickup, dropoff } = payload || {};

    if (!pickup || !dropoff) {
        throw new ApiError(400, "Pickup and dropoff are required");
    }

    const allowedRideTypes = ["standard", "scheduled", "recurring"];
    if (ride_type && !allowedRideTypes.includes(ride_type)) {
        throw new ApiError(400, "Invalid ride type");
    }

    const allowedVehicleTypes = ["car", "bike", "rickshaw"];
    if (!allowedVehicleTypes.includes(String(vehicle_type).toLowerCase())) {
        throw new ApiError(400, "Invalid vehicle type");
    }

    if (scheduled_pickup_at && Number.isNaN(new Date(scheduled_pickup_at).getTime())) {
        throw new ApiError(400, "scheduled_pickup_at must be a valid date-time string");
    }
}

function buildCityRawInput({ route, weather, demandSupply, timeFeatures }) {
    const distanceKm = Number(route.distance_km || 0);
    const travelTimeMin = Number(route.traffic_duration_min || 0);
    const normalDurationMin = Number(route.normal_duration_min || travelTimeMin || 0);

    const trafficRatio = normalDurationMin > 0 ? travelTimeMin / normalDurationMin : 1;

    const avgSpeedKmh = travelTimeMin > 0 ? distanceKm / (travelTimeMin / 60) : 0;

    return {
        distance_km: distanceKm,
        travel_time_min: travelTimeMin,
        wait_time_min: 0,

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

function validateRawInput(rawInput) {
    for (const [key, val] of Object.entries(rawInput)) {
        if (typeof val !== "number" || !Number.isFinite(val)) {
            throw new Error(`Invalid ML rawInput: key "${key}" is not a finite number (${val})`);
        }
    }
}

function round2(val) {
    return Number(Number(val).toFixed(2));
}

export async function estimateRideFare(user, payload) {
    validateEstimatePayload(payload);

    const validatedPickup = validateCoordinate(payload.pickup, "Pickup");
    const validatedDropoff = validateCoordinate(payload.dropoff, "Dropoff");
    const validatedStops = normalizeStops(payload.stops);

    const route = await getRoutePreview({
        pickup: validatedPickup,
        dropoff: validatedDropoff,
        stops: validatedStops,
        vehicleType: payload.vehicle_type
    }).catch((err) => {
        throw new ApiError(400, `Failed to calculate route: ${err.message}`);
    });

    if (!route) {
        throw new ApiError(400, "Failed to calculate route: Route is required.");
    }

    const [weather, demandSupply] = await Promise.all([
        getCurrentWeather(validatedPickup).catch(() => getDefaultWeather()),
        getDemandSupplyForPickup(validatedPickup).catch(() => getDefaultDemandSupply())
    ]);

    const timeFeatures = getTimeFeatures(payload.scheduled_pickup_at);

    const scope = resolveMlScope();

    const rawInput = buildCityRawInput({
        route,
        weather,
        demandSupply,
        timeFeatures
    });

    validateRawInput(rawInput);

    const mlResult = await predictRideSurge({
        vehicleType: payload.vehicle_type,
        scope,
        rawInput
    });

    const pricing = await getPricingRule(payload.vehicle_type);

    const peakMultiplier = getPeakMultiplier({
        hour: timeFeatures.hour,
        isWeekend: timeFeatures.is_weekend === 1
    });

    const calculatedFare = calculateFareEstimate({
        pricing,
        route,
        peakMultiplier,
        surgeMultiplier: mlResult.surge_multiplier
    });

    // Optional ML logging
    try {
        if (mongoose.connection.readyState === 1) {
            const mlVehicle = mapApiVehicleToMlVehicle(payload.vehicle_type);
            await mongoose.connection.collection("fare_prediction_logs").insertOne({
                prediction_stage: "pre_ride",
                vehicle_type: payload.vehicle_type,
                scope,
                raw_input: rawInput,
                surge_multiplier: mlResult.surge_multiplier,
                model_used: mlResult.model_used,
                ml_available: mlResult.ml_available,
                estimated_distance_km: route.distance_km,
                estimated_duration_min: route.traffic_duration_min,
                pre_ride_formula_fare: calculatedFare.pre_ride_formula_fare,
                pre_ride_ml_predicted_fare: calculatedFare.pre_ride_ml_predicted_fare,
                created_at: new Date()
            });
        }
    } catch (logErr) {
        console.error("[ML_LOGGING_ERROR]", logErr);
    }

    return {
        fare_estimate: {
            currency: pricing.currency,

            estimated_distance_km: round2(route.distance_km),
            estimated_duration_min: Math.round(route.traffic_duration_min),
            estimated_traffic_delay_min: Math.round(route.traffic_delay_min),

            base_fare: pricing.base_fare,
            per_km_rate: pricing.per_km_rate,
            per_min_rate: pricing.per_min_rate,
            waiting_per_min_rate: pricing.waiting_per_min_rate,
            traffic_delay_per_min_rate: pricing.traffic_delay_per_min_rate,
            minimum_fare: pricing.minimum_fare,

            peak_multiplier: peakMultiplier,
            surge_multiplier: mlResult.surge_multiplier,
            surge_zone_id: demandSupply.surge_zone_id,

            pre_ride_formula_fare: calculatedFare.pre_ride_formula_fare,
            pre_ride_ml_predicted_fare: calculatedFare.pre_ride_ml_predicted_fare,
            estimated_min_fare: calculatedFare.estimated_min_fare,
            estimated_max_fare: calculatedFare.estimated_max_fare,

            model_used: mlResult.model_used
        },

        route,

        nearby_drivers_count: demandSupply.nearby_drivers_count
    };
}
