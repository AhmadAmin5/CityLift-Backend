import crypto from "node:crypto";
import mongoose from "mongoose";

import { driver as neo4jDriver } from "../db/neo4j.js";
import { prisma } from "../db/postgres.js";
import DriverLocation from "../models/driverLocation.model.js";
import SurgeZone from "../models/surgeZone.model.js";

import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import logger from "../utils/logger.js";
import { getGoogleRouteDirections } from "../services/googleRoutes.service.js";

const DEFAULT_CURRENCY = "PKR";
const DEFAULT_CITY = "Lahore";

const DEFAULT_PRICING = {
    baseFare: 100,
    perKmRate: 40,
    perMinRate: 8,
    waitingPerMinRate: 5,
    trafficDelayPerMinRate: 4,
    minimumFare: 250,
    peakMultiplier: 1.0
};

const DEFAULT_MOCK_SURGE_ZONES = [
    {
        zone_id: "lahore_gulberg",
        city: "Lahore",
        area_name: "Gulberg",
        center: { latitude: 31.5204, longitude: 74.3587 },
        radius_km: 4,
        surge_multiplier: 1.2
    },
    {
        zone_id: "lahore_johar_town",
        city: "Lahore",
        area_name: "Johar Town",
        center: { latitude: 31.4697, longitude: 74.2728 },
        radius_km: 5,
        surge_multiplier: 1.15
    },
    {
        zone_id: "lahore_dha",
        city: "Lahore",
        area_name: "DHA",
        center: { latitude: 31.4697, longitude: 74.4085 },
        radius_km: 5,
        surge_multiplier: 1.1
    }
];

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const toNumber = (value, fallback = 0) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
};

const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
};

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
            stop_order: toNumber(stop.stop_order, 0),
            latitude: Number(stop.latitude),
            longitude: Number(stop.longitude),
            address: stop.address || null,
            provider: stop.provider || null,
            provider_place_id: stop.provider_place_id || null
        }))
        .sort((a, b) => a.stop_order - b.stop_order);
};

const buildWaypointList = (pickup, dropoff, stops = []) => [pickup, ...stops, dropoff];

const estimateFallbackRoute = (pickup, dropoff, stops = [], vehicleType = "car") => {
    const waypoints = buildWaypointList(pickup, dropoff, stops);

    let distanceKm = 0;
    for (let i = 0; i < waypoints.length - 1; i += 1) {
        distanceKm += haversineDistanceKm(
            waypoints[i].latitude,
            waypoints[i].longitude,
            waypoints[i + 1].latitude,
            waypoints[i + 1].longitude
        );
    }

    const averageSpeedByVehicle = {
        bike: 22,
        rickshaw: 18,
        car: 28
    };

    const averageSpeedKmph = averageSpeedByVehicle[String(vehicleType).toLowerCase()] || 28;
    const normalDurationMin = Math.max(1, Math.round((distanceKm / averageSpeedKmph) * 60));
    const trafficDelayMin = Math.max(1, Math.round(normalDurationMin * 0.25));
    const trafficDurationMin = normalDurationMin + trafficDelayMin;

    return {
        route_id: `preview_route_${Date.now()}`,
        ride_id: null,
        route_type: "pickup_to_dropoff",
        provider: "mock",
        selected: true,
        distance_km: Number(distanceKm.toFixed(2)),
        normal_duration_min: normalDurationMin,
        traffic_duration_min: trafficDurationMin,
        traffic_delay_min: trafficDelayMin,
        polyline: "encoded_polyline_here",
        steps: []
    };
};

const getPricingRuleOrDefaults = async (vehicleType, city = DEFAULT_CITY) => {
    const normalizedVehicleType = String(vehicleType || "car").toLowerCase();
    const normalizedCity = String(city || DEFAULT_CITY);

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

    if (!pricingRule) {
        return {
            city: normalizedCity,
            vehicleType: normalizedVehicleType,
            ...DEFAULT_PRICING
        };
    }

    return {
        city: pricingRule.city,
        vehicleType: pricingRule.vehicleType,
        baseFare: toNumber(pricingRule.baseFare, DEFAULT_PRICING.baseFare),
        perKmRate: toNumber(pricingRule.perKmRate, DEFAULT_PRICING.perKmRate),
        perMinRate: toNumber(pricingRule.perMinRate, DEFAULT_PRICING.perMinRate),
        waitingPerMinRate: toNumber(pricingRule.waitingPerMinRate, DEFAULT_PRICING.waitingPerMinRate),
        trafficDelayPerMinRate: toNumber(
            pricingRule.trafficDelayPerMinRate,
            DEFAULT_PRICING.trafficDelayPerMinRate
        ),
        minimumFare: toNumber(pricingRule.minimumFare, DEFAULT_PRICING.minimumFare),
        peakMultiplier: toNumber(pricingRule.peakMultiplier, DEFAULT_PRICING.peakMultiplier)
    };
};

const getCurrentPakistanTime = (referenceDate = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(referenceDate);

    const lookup = Object.fromEntries(
        parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
    );
    return {
        weekday: lookup.weekday || "",
        hour: Number(lookup.hour || 0),
        minute: Number(lookup.minute || 0)
    };
};

const isPeakHour = (referenceDate = new Date()) => {
    const { weekday, hour } = getCurrentPakistanTime(referenceDate);
    const isWeekday = !["Sat", "Sun"].includes(weekday);

    return isWeekday && ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 20));
};

const getPeakMultiplier = (pricingRule, scheduledPickupAt, recurrenceRule) => {
    const effectiveDate = scheduledPickupAt ? new Date(scheduledPickupAt) : new Date();

    // Recurrence rule is accepted by contract, but the hardcoded pricing logic does not
    // expand future recurrences yet. We still keep the field so the API shape is stable.
    void recurrenceRule;

    const multiplier = isPeakHour(effectiveDate)
        ? Math.max(1, toNumber(pricingRule.peakMultiplier, DEFAULT_PRICING.peakMultiplier))
        : 1.0;

    return Number(multiplier.toFixed(2));
};

const getSurgeContext = async (pickup, city = DEFAULT_CITY) => {
    const normalizedCity = String(city || DEFAULT_CITY);

    const databaseZones = await SurgeZone.find({
        city: new RegExp(`^${normalizedCity}$`, "i")
    }).lean();

    const zones = databaseZones.length > 0 ? databaseZones : DEFAULT_MOCK_SURGE_ZONES;

    let selectedZone = null;
    let selectedDistance = Infinity;

    for (const zone of zones) {
        const distance = haversineDistanceKm(
            pickup.latitude,
            pickup.longitude,
            zone.center.latitude,
            zone.center.longitude
        );

        if (distance < selectedDistance) {
            selectedDistance = distance;
            selectedZone = zone;
        }
    }

    if (!selectedZone) {
        return {
            surgeMultiplier: 1.0,
            surgeZoneId: null
        };
    }

    const insideZone = selectedDistance <= toNumber(selectedZone.radius_km, 0);

    return {
        surgeMultiplier: insideZone
            ? Number(toNumber(selectedZone.surge_multiplier || selectedZone.surgeMultiplier, 1.0).toFixed(2))
            : 1.0,
        surgeZoneId: insideZone ? selectedZone.zone_id : null
    };
};

const getNearbyDriversCount = async (pickup) => {
    let count = 0;

    try {
        const nearbyDrivers = await DriverLocation.find({
            is_available: true,
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [pickup.longitude, pickup.latitude]
                    },
                    $maxDistance: 3000
                }
            }
        }).lean();

        count = nearbyDrivers.length;
    } catch {
        count = 0;
    }

    if (count > 0) {
        return count;
    }

    const approvedDrivers = await prisma.driver.count({
        where: {
            approvalStatus: "approved"
        }
    });

    if (approvedDrivers > 0) {
        return approvedDrivers;
    }

    return 4;
};

const estimateRideFare = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "rider") {
        throw new ApiError(403, "Access denied. Rider account required");
    }

    const {
        ride_type,
        scheduled_pickup_at,
        recurrence_rule,
        vehicle_type = "car",
        pickup,
        dropoff,
        stops = []
    } = req.body || {};

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

    const normalizedPickup = validateCoordinate(pickup, "Pickup");
    const normalizedDropoff = validateCoordinate(dropoff, "Dropoff");
    const normalizedStops = normalizeStops(stops);

    if (scheduled_pickup_at && Number.isNaN(new Date(scheduled_pickup_at).getTime())) {
        throw new ApiError(400, "scheduled_pickup_at must be a valid date-time string");
    }

    const routePreview =
        (await getGoogleRouteDirections(
            normalizedPickup,
            normalizedDropoff,
            normalizedStops,
            vehicle_type
        )) || estimateFallbackRoute(normalizedPickup, normalizedDropoff, normalizedStops, vehicle_type);

    const pricingRule = await getPricingRuleOrDefaults(vehicle_type, DEFAULT_CITY);
    const surgeContext = await getSurgeContext(normalizedPickup, DEFAULT_CITY);
    const peakMultiplier = getPeakMultiplier(pricingRule, scheduled_pickup_at, recurrence_rule);
    const nearbyDriversCount = await getNearbyDriversCount(normalizedPickup);

    const estimatedDistanceKm = toNumber(routePreview.distance_km, 0);
    const estimatedDurationMin = toNumber(routePreview.traffic_duration_min, 0);
    const estimatedTrafficDelayMin = toNumber(routePreview.traffic_delay_min, 0);

    const rawFormulaFare =
        pricingRule.baseFare +
        estimatedDistanceKm * pricingRule.perKmRate +
        estimatedDurationMin * pricingRule.perMinRate +
        estimatedTrafficDelayMin * pricingRule.trafficDelayPerMinRate;

    const preRideFormulaFare = Math.max(
        pricingRule.minimumFare,
        Math.round(rawFormulaFare * peakMultiplier * surgeContext.surgeMultiplier * 0.8)
    );

    const preRideMlPredictedFare = Math.max(
        pricingRule.minimumFare,
        Math.round(preRideFormulaFare + estimatedDistanceKm * 0.6 + estimatedTrafficDelayMin * 0.5)
    );

    const estimatedMinFare = Math.max(pricingRule.minimumFare, Math.round(preRideFormulaFare * 0.89));

    const estimatedMaxFare = Math.max(estimatedMinFare, Math.round(preRideFormulaFare * 1.08));

    return res.status(200).json({
        success: true,
        message: "Ride fare estimated successfully",
        data: {
            fare_estimate: {
                currency: DEFAULT_CURRENCY,
                estimated_distance_km: Number(estimatedDistanceKm.toFixed(2)),
                estimated_duration_min: Math.round(estimatedDurationMin),
                estimated_traffic_delay_min: Math.round(estimatedTrafficDelayMin),
                base_fare: Math.round(pricingRule.baseFare),
                per_km_rate: Math.round(pricingRule.perKmRate),
                per_min_rate: Math.round(pricingRule.perMinRate),
                waiting_per_min_rate: Math.round(pricingRule.waitingPerMinRate),
                traffic_delay_per_min_rate: Math.round(pricingRule.trafficDelayPerMinRate),
                minimum_fare: Math.round(pricingRule.minimumFare),
                peak_multiplier: Number(peakMultiplier.toFixed(2)),
                surge_multiplier: Number(surgeContext.surgeMultiplier.toFixed(2)),
                surge_zone_id: surgeContext.surgeZoneId,
                pre_ride_formula_fare: preRideFormulaFare,
                pre_ride_ml_predicted_fare: preRideMlPredictedFare,
                estimated_min_fare: estimatedMinFare,
                estimated_max_fare: estimatedMaxFare,
                model_used: "fare_prediction_linear_regression_v1_mock"
            },
            route: {
                route_id: routePreview.route_id,
                ride_id: null,
                route_type: routePreview.route_type,
                provider: routePreview.provider,
                selected: true,
                distance_km: Number(routePreview.distance_km.toFixed(2)),
                normal_duration_min: Math.round(routePreview.normal_duration_min),
                traffic_duration_min: Math.round(routePreview.traffic_duration_min),
                traffic_delay_min: Math.round(routePreview.traffic_delay_min),
                polyline: routePreview.polyline,
                steps: routePreview.steps || []
            },
            nearby_drivers_count: nearbyDriversCount
        },
        meta: null
    });
});

const ROUTE_COLLECTION = "ride_routes";
const MATCHING_LIMIT = 3;
const OFFER_EXPIRES_IN_MINUTES = 30;

const getPricingRuleRecordOrDefaults = async (vehicleType, city = DEFAULT_CITY) => {
    const normalizedVehicleType = String(vehicleType || "car").toLowerCase();
    const normalizedCity = String(city || DEFAULT_CITY);

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

    if (!pricingRule) {
        return {
            pricingRuleId: null,
            city: normalizedCity,
            vehicleType: normalizedVehicleType,
            ...DEFAULT_PRICING
        };
    }

    return {
        pricingRuleId: pricingRule.id,
        city: pricingRule.city,
        vehicleType: pricingRule.vehicleType,
        baseFare: toNumber(pricingRule.baseFare, DEFAULT_PRICING.baseFare),
        perKmRate: toNumber(pricingRule.perKmRate, DEFAULT_PRICING.perKmRate),
        perMinRate: toNumber(pricingRule.perMinRate, DEFAULT_PRICING.perMinRate),
        waitingPerMinRate: toNumber(pricingRule.waitingPerMinRate, DEFAULT_PRICING.waitingPerMinRate),
        trafficDelayPerMinRate: toNumber(
            pricingRule.trafficDelayPerMinRate,
            DEFAULT_PRICING.trafficDelayPerMinRate
        ),
        minimumFare: toNumber(pricingRule.minimumFare, DEFAULT_PRICING.minimumFare),
        peakMultiplier: toNumber(pricingRule.peakMultiplier, DEFAULT_PRICING.peakMultiplier)
    };
};

const buildRideQuote = async ({
    pickup,
    dropoff,
    stops = [],
    vehicleType = "car",
    scheduledPickupAt = null,
    recurrenceRule = null
}) => {
    const routePreview =
        (await getGoogleRouteDirections(pickup, dropoff, stops, vehicleType)) ||
        estimateFallbackRoute(pickup, dropoff, stops, vehicleType);

    const pricingRule = await getPricingRuleRecordOrDefaults(vehicleType, DEFAULT_CITY);
    const surgeContext = await getSurgeContext(pickup, DEFAULT_CITY);
    const peakMultiplier = getPeakMultiplier(pricingRule, scheduledPickupAt);

    const estimatedDistanceKm = toNumber(routePreview.distance_km, 0);
    const estimatedDurationMin = toNumber(routePreview.traffic_duration_min, 0);
    const estimatedTrafficDelayMin = toNumber(routePreview.traffic_delay_min, 0);

    const rawFormulaFare =
        pricingRule.baseFare +
        estimatedDistanceKm * pricingRule.perKmRate +
        estimatedDurationMin * pricingRule.perMinRate +
        estimatedTrafficDelayMin * pricingRule.trafficDelayPerMinRate;

    const preRideFormulaFare = Math.max(
        pricingRule.minimumFare,
        Math.round(rawFormulaFare * peakMultiplier * surgeContext.surgeMultiplier * 0.8)
    );

    const preRideMlPredictedFare = Math.max(
        pricingRule.minimumFare,
        Math.round(preRideFormulaFare + estimatedDistanceKm * 0.6 + estimatedTrafficDelayMin * 0.5)
    );

    const estimatedMinFare = Math.max(pricingRule.minimumFare, Math.round(preRideFormulaFare * 0.89));
    const estimatedMaxFare = Math.max(estimatedMinFare, Math.round(preRideFormulaFare * 1.08));

    return {
        pricingRule,
        surgeContext,
        peakMultiplier,
        routePreview,
        fare: {
            currency: DEFAULT_CURRENCY,
            estimated_distance_km: Number(estimatedDistanceKm.toFixed(2)),
            estimated_duration_min: Math.round(estimatedDurationMin),
            estimated_traffic_delay_min: Math.round(estimatedTrafficDelayMin),
            pre_ride_formula_fare: preRideFormulaFare,
            pre_ride_ml_predicted_fare: preRideMlPredictedFare,
            estimated_min_fare: estimatedMinFare,
            estimated_max_fare: estimatedMaxFare
        }
    };
};

const getMatchingDrivers = async ({ pickup, vehicleType }) => {
    let nearbyLocations = [];

    try {
        nearbyLocations = await DriverLocation.find({
            is_available: true,
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [pickup.longitude, pickup.latitude]
                    },
                    $maxDistance: 5000
                }
            }
        })
            .limit(10)
            .lean();
    } catch {
        nearbyLocations = [];
    }

    const orderedIds = [...new Set(nearbyLocations.map((doc) => doc.driver_id))];
    const locationMap = new Map(nearbyLocations.map((doc) => [doc.driver_id, doc]));

    const commonWhere = {
        approvalStatus: "approved",
        isAvailable: true,
        vehicles: {
            some: {
                isActive: true,
                verificationStatus: "approved",
                vehicleType
            }
        }
    };

    let drivers = [];

    if (orderedIds.length > 0) {
        drivers = await prisma.driver.findMany({
            where: {
                id: { in: orderedIds },
                ...commonWhere
            },
            include: {
                vehicles: {
                    where: {
                        isActive: true,
                        verificationStatus: "approved",
                        vehicleType
                    },
                    take: 1
                }
            }
        });
    }

    if (drivers.length === 0) {
        drivers = await prisma.driver.findMany({
            where: commonWhere,
            include: {
                vehicles: {
                    where: {
                        isActive: true,
                        verificationStatus: "approved",
                        vehicleType
                    },
                    take: 1
                }
            },
            take: MATCHING_LIMIT
        });
    }

    const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));
    const orderedDrivers = orderedIds.length
        ? orderedIds.map((id) => driverMap.get(id)).filter(Boolean)
        : drivers;

    return orderedDrivers.slice(0, MATCHING_LIMIT).map((driver) => {
        const locationDoc = locationMap.get(driver.id);
        const distanceToPickupKm = locationDoc
            ? haversineDistanceKm(
                  pickup.latitude,
                  pickup.longitude,
                  locationDoc.location.coordinates[1],
                  locationDoc.location.coordinates[0]
              )
            : null;

        return {
            driver,
            distanceToPickupKm,
            driverRatingAtOffer: Number(driver.averageRating)
        };
    });
};

const persistRideRouteToMongo = async ({ route, rideId, pickup, dropoff, stops, vehicleType }) => {
    if (mongoose.connection.readyState !== 1) return null;

    const collection = mongoose.connection.collection(ROUTE_COLLECTION);
    const document = {
        route_id: route.route_id,
        ride_id: rideId,
        route_type: route.route_type,
        provider: route.provider,
        selected: true,
        distance_km: route.distance_km,
        normal_duration_min: route.normal_duration_min,
        traffic_duration_min: route.traffic_duration_min,
        traffic_delay_min: route.traffic_delay_min,
        polyline: route.polyline,
        steps: route.steps || [],
        pickup,
        dropoff,
        stops,
        vehicle_type: vehicleType,
        created_at: new Date(),
        updated_at: new Date()
    };

    await collection.insertOne(document);
    return document;
};

const persistRideGraphToNeo4j = async ({ riderId, rideId, pickupAreaName, dropoffAreaName }) => {
    if (!neo4jDriver) return;

    const session = neo4jDriver.session();

    try {
        await session.run(
            `
            MERGE (r:Rider {id: $riderId})
            MERGE (ride:Ride {id: $rideId})
            MERGE (pickupArea:Area {name: $pickupAreaName})
            MERGE (dropoffArea:Area {name: $dropoffAreaName})

            MERGE (r)-[:REQUESTED]->(ride)
            MERGE (ride)-[:PICKUP_IN]->(pickupArea)
            MERGE (ride)-[:DROPOFF_IN]->(dropoffArea)
            `,
            {
                riderId,
                rideId,
                pickupAreaName,
                dropoffAreaName
            }
        );
    } finally {
        await session.close();
    }
};

const formatRideResponse = ({ ride, requestBody, routeId }) => {
    const stops = (ride.stops || [])
        .slice()
        .sort((a, b) => a.stopOrder - b.stopOrder)
        .map((stop) => ({
            id: stop.id,
            ride_id: stop.rideId,
            stop_order: stop.stopOrder,
            stop_type: stop.stopType,
            latitude: Number(stop.latitude),
            longitude: Number(stop.longitude),
            address: stop.address,
            provider: stop.provider,
            provider_place_id: stop.providerPlaceId,
            arrived_at: stop.arrivedAt,
            departed_at: stop.departedAt,
            created_at: stop.createdAt
        }));

    return {
        id: ride.id,
        rider_id: ride.riderId,
        driver_id: ride.driverId,
        vehicle_id: ride.vehicleId,
        ride_type: ride.rideType,
        scheduled_pickup_at: ride.scheduledPickupAt,
        recurrence_rule: ride.recurrenceRule,
        pickup: {
            latitude: Number(ride.pickupLatitude),
            longitude: Number(ride.pickupLongitude),
            address: requestBody.pickup?.address || ride.pickupAddress || null,
            provider: requestBody.pickup?.provider || null,
            provider_place_id: requestBody.pickup?.provider_place_id || ride.pickupProviderPlaceId || null
        },
        dropoff: {
            latitude: Number(ride.dropoffLatitude),
            longitude: Number(ride.dropoffLongitude),
            address: requestBody.dropoff?.address || ride.dropoffAddress || null,
            provider: requestBody.dropoff?.provider || null,
            provider_place_id: requestBody.dropoff?.provider_place_id || ride.dropoffProviderPlaceId || null
        },
        rider_note_to_driver: ride.riderNoteToDriver,
        status: ride.status,
        selected_route_id: routeId,
        surge_zone_id: ride.surgeZoneId,
        cancelled_by_user_id: ride.cancelledByUserId,
        cancellation_reason: ride.cancellationReason,
        requested_at: ride.requestedAt,
        accepted_at: ride.acceptedAt,
        arrived_at: ride.arrivedAt,
        started_at: ride.startedAt,
        completed_at: ride.completedAt,
        cancelled_at: ride.cancelledAt,
        created_at: ride.createdAt,
        updated_at: ride.updatedAt,
        stops,
        fare: ride.fare
            ? {
                  id: ride.fare.id,
                  ride_id: ride.fare.rideId,
                  currency: ride.fare.currency,
                  estimated_distance_km:
                      ride.fare.estimatedDistanceKm === null ? null : Number(ride.fare.estimatedDistanceKm),
                  estimated_duration_min: ride.fare.estimatedDurationMin,
                  estimated_traffic_delay_min: ride.fare.estimatedTrafficDelayMin,
                  pre_ride_ml_predicted_fare:
                      ride.fare.preRideMlPredictedFare === null
                          ? null
                          : Number(ride.fare.preRideMlPredictedFare),
                  pre_ride_formula_fare:
                      ride.fare.preRideFormulaFare === null ? null : Number(ride.fare.preRideFormulaFare),
                  estimated_min_fare:
                      ride.fare.estimatedMinFare === null ? null : Number(ride.fare.estimatedMinFare),
                  estimated_max_fare:
                      ride.fare.estimatedMaxFare === null ? null : Number(ride.fare.estimatedMaxFare),
                  peak_multiplier: Number(ride.fare.peakMultiplier),
                  surge_multiplier: Number(ride.fare.surgeMultiplier),
                  cancellation_fee: Number(ride.fare.cancellationFee),
                  final_fare: ride.fare.finalFare === null ? null : Number(ride.fare.finalFare),
                  model_used: ride.fare.modelUsed
              }
            : null,
        driver: null,
        vehicle: null
    };
};

const createRideRequest = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "rider") {
        throw new ApiError(403, "Access denied. Rider account required");
    }

    const {
        ride_type = "standard",
        scheduled_pickup_at,
        recurrence_rule,
        vehicle_type = "car",
        pickup,
        dropoff,
        stops = [],
        rider_note_to_driver = null
    } = req.body || {};

    if (!pickup || !dropoff) {
        throw new ApiError(400, "Pickup and dropoff are required");
    }

    const allowedRideTypes = ["standard", "scheduled", "recurring"];
    if (!allowedRideTypes.includes(ride_type)) {
        throw new ApiError(400, "Invalid ride type");
    }

    const allowedVehicleTypes = ["car", "bike", "rickshaw"];
    const normalizedVehicleType = String(vehicle_type).toLowerCase();
    if (!allowedVehicleTypes.includes(normalizedVehicleType)) {
        throw new ApiError(400, "Invalid vehicle type");
    }

    if (scheduled_pickup_at && Number.isNaN(new Date(scheduled_pickup_at).getTime())) {
        throw new ApiError(400, "scheduled_pickup_at must be a valid date-time string");
    }

    if ((ride_type === "scheduled" || ride_type === "recurring") && !scheduled_pickup_at) {
        throw new ApiError(400, "scheduled_pickup_at is required for scheduled or recurring rides");
    }

    if (ride_type === "recurring" && !recurrence_rule) {
        throw new ApiError(400, "recurrence_rule is required for recurring rides");
    }

    const normalizedPickup = validateCoordinate(pickup, "Pickup");
    const normalizedDropoff = validateCoordinate(dropoff, "Dropoff");
    const normalizedStops = normalizeStops(stops);

    const quote = await buildRideQuote({
        pickup: normalizedPickup,
        dropoff: normalizedDropoff,
        stops: normalizedStops,
        vehicleType: normalizedVehicleType,
        scheduledPickupAt: scheduled_pickup_at || null,
        recurrenceRule: recurrence_rule || null
    });

    const routeId = `route_${crypto.randomUUID()}`;
    const rideId = crypto.randomUUID();
    const offerExpiresAt = new Date(Date.now() + OFFER_EXPIRES_IN_MINUTES * 60 * 1000);

    const matchingDrivers = await getMatchingDrivers({
        pickup: normalizedPickup,
        vehicleType: normalizedVehicleType
    });

    const createdRide = await prisma.$transaction(async (tx) => {
        const rideStopCreates = [
            {
                stopOrder: 1,
                stopType: "pickup",
                latitude: normalizedPickup.latitude,
                longitude: normalizedPickup.longitude,
                address: pickup.address || null,
                provider: pickup.provider || null,
                providerPlaceId: pickup.provider_place_id || null
            },
            ...normalizedStops.map((stop, index) => ({
                stopOrder:
                    Number.isFinite(stop.stop_order) && stop.stop_order > 1 ? stop.stop_order : index + 2,
                stopType: "intermediate",
                latitude: stop.latitude,
                longitude: stop.longitude,
                address: stop.address || null,
                provider: stop.provider || null,
                providerPlaceId: stop.provider_place_id || null
            })),
            {
                stopOrder:
                    Math.max(
                        1,
                        ...normalizedStops.map((stop, index) =>
                            Number.isFinite(stop.stop_order) && stop.stop_order > 1
                                ? stop.stop_order
                                : index + 2
                        )
                    ) + 1,
                stopType: "dropoff",
                latitude: normalizedDropoff.latitude,
                longitude: normalizedDropoff.longitude,
                address: dropoff.address || null,
                provider: dropoff.provider || null,
                providerPlaceId: dropoff.provider_place_id || null
            }
        ];

        const offerCreates = matchingDrivers.map(({ driver, distanceToPickupKm, driverRatingAtOffer }) => ({
            driverId: driver.id,
            status: "sent",
            distanceToPickupKm,
            driverRatingAtOffer,
            expiresAt: offerExpiresAt
        }));

        return tx.ride.create({
            data: {
                id: rideId,
                riderId: req.user.riderProfile?.id || req.user.rider_profile?.id,
                driverId: null,
                vehicleId: null,
                rideType: ride_type,
                scheduledPickupAt: scheduled_pickup_at ? new Date(scheduled_pickup_at) : null,
                recurrenceRule: recurrence_rule || null,
                pickupLatitude: normalizedPickup.latitude,
                pickupLongitude: normalizedPickup.longitude,
                pickupAddress: pickup.address || null,
                pickupProviderPlaceId: pickup.provider_place_id || null,
                dropoffLatitude: normalizedDropoff.latitude,
                dropoffLongitude: normalizedDropoff.longitude,
                dropoffAddress: dropoff.address || null,
                dropoffProviderPlaceId: dropoff.provider_place_id || null,
                riderNoteToDriver: rider_note_to_driver,
                status: "searching_driver",
                selectedRouteId: routeId,
                surgeZoneId: quote.surgeContext.surgeZoneId,
                stops: {
                    create: rideStopCreates
                },
                fare: {
                    create: {
                        pricingRuleId: quote.pricingRule.pricingRuleId,
                        currency: DEFAULT_CURRENCY,
                        estimatedDistanceKm: quote.fare.estimated_distance_km,
                        estimatedDurationMin: quote.fare.estimated_duration_min,
                        estimatedTrafficDelayMin: quote.fare.estimated_traffic_delay_min,
                        preRideMlPredictedFare: quote.fare.pre_ride_ml_predicted_fare,
                        preRideFormulaFare: quote.fare.pre_ride_formula_fare,
                        estimatedMinFare: quote.fare.estimated_min_fare,
                        estimatedMaxFare: quote.fare.estimated_max_fare,
                        peakMultiplier: quote.peakMultiplier,
                        surgeMultiplier: quote.surgeContext.surgeMultiplier,
                        cancellationFee: 0,
                        finalFare: null,
                        farePolicy: "metered_after_ride",
                        modelUsed: "fare_prediction_linear_regression_v1"
                    }
                },
                statusHistory: {
                    create: {
                        oldStatus: null,
                        newStatus: "searching_driver",
                        changedByUserId: req.user.id
                    }
                },
                ...(offerCreates.length > 0
                    ? {
                          offers: {
                              create: offerCreates
                          }
                      }
                    : {})
            },
            include: {
                stops: true,
                fare: true
            }
        });
    });

    const routeForResponse = {
        ...quote.routePreview,
        route_id: routeId,
        ride_id: rideId
    };

    const pickupAreaName = quote.surgeContext.surgeZoneName || DEFAULT_CITY;
    const dropoffAreaName = DEFAULT_CITY;

    await Promise.allSettled([
        persistRideRouteToMongo({
            route: routeForResponse,
            rideId,
            pickup: {
                latitude: normalizedPickup.latitude,
                longitude: normalizedPickup.longitude,
                address: pickup.address || null,
                provider: pickup.provider || null,
                provider_place_id: pickup.provider_place_id || null
            },
            dropoff: {
                latitude: normalizedDropoff.latitude,
                longitude: normalizedDropoff.longitude,
                address: dropoff.address || null,
                provider: dropoff.provider || null,
                provider_place_id: dropoff.provider_place_id || null
            },
            stops: normalizedStops,
            vehicleType: normalizedVehicleType
        }),
        persistRideGraphToNeo4j({
            riderId: createdRide.riderId,
            rideId,
            pickupAreaName,
            dropoffAreaName
        })
    ]).then((results) => {
        results.forEach((result) => {
            if (result.status === "rejected") {
                logger.warn(`Ride side-effect failed: ${result.reason?.message || result.reason}`);
            }
        });
    });

    return res.status(201).json({
        success: true,
        message: "Ride requested successfully",
        data: {
            ride: formatRideResponse({
                ride: createdRide,
                requestBody: req.body,
                routeId
            }),
            route: {
                route_id: routeId,
                ride_id: rideId,
                route_type: routeForResponse.route_type,
                provider: routeForResponse.provider,
                selected: true,
                distance_km: Number(routeForResponse.distance_km.toFixed(2)),
                normal_duration_min: Math.round(routeForResponse.normal_duration_min),
                traffic_duration_min: Math.round(routeForResponse.traffic_duration_min),
                traffic_delay_min: Math.round(routeForResponse.traffic_delay_min),
                polyline: routeForResponse.polyline,
                steps: routeForResponse.steps || []
            },
            matching: {
                status: "searching_driver",
                offers_sent: matchingDrivers.length
            }
        },
        meta: null
    });
});

export { estimateRideFare, createRideRequest };
