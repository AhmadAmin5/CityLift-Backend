import { prisma } from "../db/postgres.js";

export async function getPricingRule(vehicleType, city = "Lahore") {
    const normalizedVehicleType = String(vehicleType || "car").toLowerCase();
    const normalizedCity = String(city || "Lahore");

    try {
        const pricingRule =
            (await prisma.pricingRule.findFirst({
                where: {
                    city: normalizedCity,
                    vehicleType: normalizedVehicleType,
                    isActive: true
                },
                orderBy: {
                    createdAt: "desc"
                }
            })) ||
            (await prisma.pricingRule.findFirst({
                where: {
                    city: "default",
                    vehicleType: normalizedVehicleType,
                    isActive: true
                },
                orderBy: {
                    createdAt: "desc"
                }
            }));

        if (pricingRule) {
            return {
                currency: "PKR",
                base_fare: Number(pricingRule.baseFare),
                per_km_rate: Number(pricingRule.perKmRate),
                per_min_rate: Number(pricingRule.perMinRate),
                waiting_per_min_rate: Number(pricingRule.waitingPerMinRate || 0),
                traffic_delay_per_min_rate: Number(pricingRule.trafficDelayPerMinRate || 0),
                minimum_fare: Number(pricingRule.minimumFare)
            };
        }
    } catch (err) {
        // Fallback to default on database errors
    }

    if (normalizedVehicleType === "bike") {
        return {
            currency: "PKR",
            base_fare: 60,
            per_km_rate: 25,
            per_min_rate: 4,
            waiting_per_min_rate: 3,
            traffic_delay_per_min_rate: 2,
            minimum_fare: 120
        };
    }

    if (normalizedVehicleType === "rickshaw") {
        return {
            currency: "PKR",
            base_fare: 80,
            per_km_rate: 30,
            per_min_rate: 5,
            waiting_per_min_rate: 4,
            traffic_delay_per_min_rate: 3,
            minimum_fare: 180
        };
    }

    return {
        currency: "PKR",
        base_fare: 100,
        per_km_rate: 40,
        per_min_rate: 8,
        waiting_per_min_rate: 5,
        traffic_delay_per_min_rate: 4,
        minimum_fare: 250
    };
}

export function getPeakMultiplier({ hour, isWeekend }) {
    const morningPeak = hour >= 7 && hour <= 10;
    const eveningPeak = hour >= 17 && hour <= 21;

    if (!isWeekend && (morningPeak || eveningPeak)) return 1.15;

    return 1.0;
}

export function calculateFareEstimate({ pricing, route, peakMultiplier, surgeMultiplier }) {
    const baseFormulaFare =
        pricing.base_fare +
        pricing.per_km_rate * route.distance_km +
        pricing.per_min_rate * route.traffic_duration_min +
        pricing.traffic_delay_per_min_rate * route.traffic_delay_min;

    const preRideFormulaFare = Math.max(pricing.minimum_fare, baseFormulaFare * peakMultiplier);

    const preRideMlPredictedFare = Math.max(
        pricing.minimum_fare,
        baseFormulaFare * peakMultiplier * surgeMultiplier
    );

    return {
        pre_ride_formula_fare: Math.round(preRideFormulaFare),
        pre_ride_ml_predicted_fare: Math.round(preRideMlPredictedFare),
        estimated_min_fare: Math.round(preRideMlPredictedFare * 0.9),
        estimated_max_fare: Math.round(preRideMlPredictedFare * 1.1)
    };
}
