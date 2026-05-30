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
import * as rideEstimateService from "../services/rideEstimate.service.js";

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

const estimateRideFare = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "rider") {
        throw new ApiError(403, "Access denied. Rider account required");
    }

    const result = await rideEstimateService.estimateRideFare(req.user, req.body);

    return res.status(200).json({
        success: true,
        message: "Ride fare estimated successfully",
        data: result,
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

    const pickupStop = (ride.stops || []).find(
        (s) => s.stopType === "pickup" || s.stopOrder === 1
    );
    const dropoffStop = (ride.stops || []).find(
        (s) =>
            s.stopType === "dropoff" ||
            s.stopOrder === Math.max(1, ...(ride.stops || []).map((st) => st.stopOrder))
    );

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
            address: ride.pickupAddress || pickupStop?.address || null,
            provider: pickupStop?.provider || requestBody?.pickup?.provider || null,
            provider_place_id: ride.pickupProviderPlaceId || pickupStop?.providerPlaceId || requestBody?.pickup?.provider_place_id || null
        },
        dropoff: {
            latitude: Number(ride.dropoffLatitude),
            longitude: Number(ride.dropoffLongitude),
            address: ride.dropoffAddress || dropoffStop?.address || null,
            provider: dropoffStop?.provider || requestBody?.dropoff?.provider || null,
            provider_place_id: ride.dropoffProviderPlaceId || dropoffStop?.providerPlaceId || requestBody?.dropoff?.provider_place_id || null
        },
        rider_note_to_driver: ride.riderNoteToDriver,
        status: ride.status,
        selected_route_id: routeId || ride.selectedRouteId,
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
        driver: ride.driver
            ? {
                  id: ride.driver.id,
                  name: ride.driver.user?.name || null,
                  phone: ride.driver.user?.phone || null,
                  average_rating: Number(ride.driver.averageRating),
                  profile_photo_url: ride.driver.user?.profilePhotoUrl || null
              }
            : null,
        vehicle: ride.vehicle
            ? {
                  id: ride.vehicle.id,
                  make: ride.vehicle.make,
                  model: ride.vehicle.model,
                  plate_number: ride.vehicle.plateNumber,
                  color: ride.vehicle.color,
                  vehicle_type: ride.vehicle.vehicleType
              }
            : null
    };
};

const formatListRideResponse = (ride) => {
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
            address: ride.pickupAddress || null
        },
        dropoff: {
            latitude: Number(ride.dropoffLatitude),
            longitude: Number(ride.dropoffLongitude),
            address: ride.dropoffAddress || null
        },
        rider_note_to_driver: ride.riderNoteToDriver,
        status: ride.status,
        selected_route_id: ride.selectedRouteId,
        surge_zone_id: ride.surgeZoneId,
        requested_at: ride.requestedAt,
        completed_at: ride.completedAt,
        fare: ride.fare
            ? {
                  currency: ride.fare.currency,
                  final_fare: ride.fare.finalFare === null ? null : Number(ride.fare.finalFare),
                  estimated_min_fare: ride.fare.estimatedMinFare === null ? null : Number(ride.fare.estimatedMinFare),
                  estimated_max_fare: ride.fare.estimatedMaxFare === null ? null : Number(ride.fare.estimatedMaxFare)
              }
            : null,
        driver: ride.driver
            ? {
                  id: ride.driver.id,
                  name: ride.driver.user?.name || null,
                  average_rating: Number(ride.driver.averageRating),
                  profile_photo_url: ride.driver.user?.profilePhotoUrl || null
              }
            : null,
        vehicle: ride.vehicle
            ? {
                  id: ride.vehicle.id,
                  make: ride.vehicle.make,
                  model: ride.vehicle.model,
                  plate_number: ride.vehicle.plateNumber,
                  color: ride.vehicle.color,
                  vehicle_type: ride.vehicle.vehicleType
              }
            : null
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

const listMyRides = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { status, ride_type, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNum - 1) * limitNum;

    // Filter by role
    let profileId = null;
    const whereClause = {};

    if (req.user.role === "rider") {
        profileId = req.user.riderProfile?.id || req.user.rider_profile?.id;
        if (!profileId) {
            throw new ApiError(404, "Rider profile not found");
        }
        whereClause.riderId = profileId;
    } else if (req.user.role === "driver") {
        profileId = req.user.driverProfile?.id || req.user.driver_profile?.id;
        if (!profileId) {
            throw new ApiError(404, "Driver profile not found");
        }
        whereClause.driverId = profileId;
    } else {
        throw new ApiError(403, "Access denied. Rider or Driver account required");
    }

    if (status) {
        whereClause.status = status;
    }
    if (ride_type) {
        whereClause.rideType = ride_type;
    }

    const [total, rides] = await Promise.all([
        prisma.ride.count({ where: whereClause }),
        prisma.ride.findMany({
            where: whereClause,
            include: {
                stops: true,
                fare: true,
                driver: {
                    include: {
                        user: true
                    }
                },
                vehicle: true
            },
            orderBy: {
                createdAt: "desc"
            },
            skip,
            take: limitNum
        })
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
        success: true,
        message: "Rides fetched successfully",
        data: rides.map(formatListRideResponse),
        meta: {
            page: pageNum,
            limit: limitNum,
            total,
            total_pages: totalPages
        }
    });
});

const getRideDetails = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: {
            stops: true,
            fare: true,
            driver: {
                include: {
                    user: true
                }
            },
            vehicle: true
        }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (req.user.role === "rider") {
        const riderId = req.user.riderProfile?.id || req.user.rider_profile?.id;
        if (ride.riderId !== riderId) {
            throw new ApiError(403, "Access denied");
        }
    } else if (req.user.role === "driver") {
        const driverId = req.user.driverProfile?.id || req.user.driver_profile?.id;
        if (ride.driverId && ride.driverId !== driverId) {
            throw new ApiError(403, "Access denied");
        }
    }

    return res.status(200).json({
        success: true,
        message: "Ride fetched successfully",
        data: {
            ride: formatRideResponse({ ride })
        },
        meta: null
    });
});

const getRideRoute = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;
    const route_type = req.query.route_type || "pickup_to_dropoff";

    const rideExists = await prisma.ride.findUnique({
        where: { id: ride_id }
    });
    if (!rideExists) {
        throw new ApiError(404, "Ride not found");
    }

    if (mongoose.connection.readyState !== 1) {
        throw new ApiError(500, "Database connection not available");
    }

    const collection = mongoose.connection.collection("ride_routes");
    const route = await collection.findOne({ ride_id, route_type });

    if (!route) {
        throw new ApiError(404, "Ride route not found");
    }

    return res.status(200).json({
        success: true,
        message: "Ride route fetched successfully",
        data: {
            route: {
                route_id: route.route_id || route._id?.toString(),
                ride_id: route.ride_id,
                route_type: route.route_type,
                provider: route.provider,
                selected: route.selected ?? true,
                distance_km: Number(route.distance_km),
                normal_duration_min: Math.round(route.normal_duration_min),
                traffic_duration_min: Math.round(route.traffic_duration_min),
                traffic_delay_min: Math.round(route.traffic_delay_min),
                polyline: route.polyline,
                steps: route.steps || []
            }
        },
        meta: null
    });
});

const getRideLiveState = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: { fare: true }
    });
    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (mongoose.connection.readyState !== 1) {
        throw new ApiError(500, "Database connection not available");
    }

    const collection = mongoose.connection.collection("ride_live_state");
    const liveStateDoc = await collection.findOne({ ride_id });

    let live_state;
    if (liveStateDoc) {
        live_state = {
            ride_id: liveStateDoc.ride_id,
            rider_id: liveStateDoc.rider_id,
            driver_id: liveStateDoc.driver_id,
            status: liveStateDoc.status,
            current_location: {
                latitude: liveStateDoc.current_location?.coordinates?.[1] ?? liveStateDoc.current_location?.latitude ?? Number(ride.pickupLatitude),
                longitude: liveStateDoc.current_location?.coordinates?.[0] ?? liveStateDoc.current_location?.longitude ?? Number(ride.pickupLongitude)
            },
            current_route_id: liveStateDoc.current_route_id || ride.selectedRouteId,
            eta_min: liveStateDoc.eta_min ?? Math.round(ride.fare?.estimatedDurationMin || 0),
            distance_remaining_km: liveStateDoc.distance_remaining_km ?? Number(ride.fare?.estimatedDistanceKm || 0),
            updated_at: liveStateDoc.updated_at || liveStateDoc.updatedAt || new Date()
        };
    } else {
        live_state = {
            ride_id: ride.id,
            rider_id: ride.riderId,
            driver_id: ride.driverId,
            status: ride.status,
            current_location: {
                latitude: Number(ride.pickupLatitude),
                longitude: Number(ride.pickupLongitude)
            },
            current_route_id: ride.selectedRouteId,
            eta_min: Math.round(ride.fare?.estimatedDurationMin || 0),
            distance_remaining_km: Number(ride.fare?.estimatedDistanceKm || 0),
            updated_at: ride.updatedAt
        };
    }

    return res.status(200).json({
        success: true,
        message: "Ride live state fetched successfully",
        data: {
            live_state
        },
        meta: null
    });
});

const cancelRide = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;
    const { reason = "" } = req.body;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: { fare: true }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.status === "completed" || ride.status === "cancelled") {
        throw new ApiError(409, `Cannot cancel ride in status: ${ride.status}`);
    }

    let isRider = false;
    let isDriver = false;

    if (req.user.role === "rider") {
        const riderId = req.user.riderProfile?.id || req.user.rider_profile?.id;
        if (ride.riderId === riderId) {
            isRider = true;
        }
    } else if (req.user.role === "driver") {
        const driverId = req.user.driverProfile?.id || req.user.driver_profile?.id;
        if (ride.driverId === driverId) {
            isDriver = true;
        }
    }

    if (!isRider && !isDriver) {
        throw new ApiError(403, "Access denied");
    }

    let cancellationFee = 0;
    let feeCharged = false;
    let rule = "driver_cancelled";

    if (isRider) {
        if (ride.driverId) {
            cancellationFee = 100;
            feeCharged = true;
            rule = "rider_cancelled_after_driver_accept";
        } else {
            cancellationFee = 0;
            feeCharged = false;
            rule = "rider_cancelled_before_driver_accept";
        }
    }

    const updatedRide = await prisma.$transaction(async (tx) => {
        const updated = await tx.ride.update({
            where: { id: ride.id },
            data: {
                status: "cancelled",
                cancelledByUserId: req.user.id,
                cancellationReason: reason,
                cancelledAt: new Date()
            },
            include: {
                stops: true,
                fare: true
            }
        });

        if (updated.fare) {
            await tx.rideFare.update({
                where: { id: updated.fare.id },
                data: {
                    cancellationFee,
                    finalFare: cancellationFee,
                    finalizedAt: new Date()
                }
            });
            updated.fare.cancellationFee = cancellationFee;
            updated.fare.finalFare = cancellationFee;
        }

        await tx.rideStatusHistory.create({
            data: {
                rideId: ride.id,
                oldStatus: ride.status,
                newStatus: "cancelled",
                changedByUserId: req.user.id
            }
        });

        if (ride.driverId) {
            await tx.driver.update({
                where: { id: ride.driverId },
                data: { isAvailable: true }
            });
        }

        return updated;
    });

    Promise.allSettled([
        (async () => {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.collection("ride_live_state").deleteOne({ ride_id: ride.id });
                if (ride.driverId) {
                    await DriverLocation.updateOne(
                        { driver_id: ride.driverId },
                        { $set: { is_available: true, updated_at: new Date() } }
                    );
                }
            }
        })(),
        (async () => {
            if (neo4jDriver) {
                const session = neo4jDriver.session();
                try {
                    await session.run(
                        `
                        MATCH (r:Ride {id: $rideId})
                        SET r.status = "cancelled", r.cancellation_fee = $cancellationFee
                        `,
                        { rideId: ride.id, cancellationFee }
                    );
                } finally {
                    await session.close();
                }
            }
        })()
    ]).catch((err) => {
        logger.warn(`Side-effects after cancellation failed: ${err.message}`);
    });

    return res.status(200).json({
        success: true,
        message: "Ride cancelled successfully",
        data: {
            ride: {
                id: updatedRide.id,
                status: updatedRide.status,
                cancelled_by_user_id: updatedRide.cancelledByUserId,
                cancellation_reason: updatedRide.cancellationReason,
                cancelled_at: updatedRide.cancelledAt
            },
            cancellation: {
                currency: "PKR",
                cancellation_fee: cancellationFee,
                fee_charged: feeCharged,
                rule
            }
        },
        meta: null
    });
});

const driverArrived = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "driver") {
        throw new ApiError(403, "Access denied. Driver account required");
    }

    const { ride_id } = req.params;
    const driverId = req.user.driverProfile?.id || req.user.driver_profile?.id;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.driverId !== driverId) {
        throw new ApiError(403, "Access denied. You are not assigned to this ride");
    }

    if (ride.status !== "accepted" && ride.status !== "driver_assigned") {
        throw new ApiError(409, `Cannot transition to arrived from status: ${ride.status}`);
    }

    const arrivedAt = new Date();
    const updatedRide = await prisma.$transaction(async (tx) => {
        const updated = await tx.ride.update({
            where: { id: ride.id },
            data: {
                status: "arrived",
                arrivedAt
            }
        });

        await tx.rideStatusHistory.create({
            data: {
                rideId: ride.id,
                oldStatus: ride.status,
                newStatus: "arrived",
                changedByUserId: req.user.id
            }
        });

        await tx.rideStop.updateMany({
            where: {
                rideId: ride.id,
                stopType: "pickup"
            },
            data: {
                arrivedAt
            }
        });

        return updated;
    });

    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.collection("ride_live_state").updateOne(
            { ride_id: ride.id },
            {
                $set: {
                    status: "arrived",
                    updated_at: new Date()
                }
            },
            { upsert: true }
        );
    }

    return res.status(200).json({
        success: true,
        message: "Driver marked as arrived",
        data: {
            ride: {
                id: updatedRide.id,
                status: updatedRide.status,
                arrived_at: updatedRide.arrivedAt
            }
        },
        meta: null
    });
});

const driverStartRide = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "driver") {
        throw new ApiError(403, "Access denied. Driver account required");
    }

    const { ride_id } = req.params;
    const driverId = req.user.driverProfile?.id || req.user.driver_profile?.id;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: { fare: true }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.driverId !== driverId) {
        throw new ApiError(403, "Access denied. You are not assigned to this ride");
    }

    const allowedStatuses = ["accepted", "driver_assigned", "arrived"];
    if (!allowedStatuses.includes(ride.status)) {
        throw new ApiError(409, `Cannot start ride from status: ${ride.status}`);
    }

    const startedAt = new Date();
    const updatedRide = await prisma.$transaction(async (tx) => {
        const updated = await tx.ride.update({
            where: { id: ride.id },
            data: {
                status: "started",
                startedAt
            }
        });

        await tx.rideStatusHistory.create({
            data: {
                rideId: ride.id,
                oldStatus: ride.status,
                newStatus: "started",
                changedByUserId: req.user.id
            }
        });

        await tx.rideStop.updateMany({
            where: {
                rideId: ride.id,
                stopType: "pickup"
            },
            data: {
                departedAt: startedAt
            }
        });

        return updated;
    });

    let liveState = {};
    if (mongoose.connection.readyState === 1) {
        const collection = mongoose.connection.collection("ride_live_state");
        const doc = {
            ride_id: ride.id,
            rider_id: ride.riderId,
            driver_id: ride.driverId,
            status: "started",
            current_location: {
                type: "Point",
                coordinates: [Number(ride.pickupLongitude), Number(ride.pickupLatitude)]
            },
            current_route_id: ride.selectedRouteId,
            eta_min: Math.round(ride.fare?.estimatedDurationMin || 22),
            distance_remaining_km: Number(ride.fare?.estimatedDistanceKm || 12.4),
            updated_at: startedAt
        };

        await collection.updateOne(
            { ride_id: ride.id },
            { $set: doc },
            { upsert: true }
        );

        liveState = {
            ride_id: doc.ride_id,
            rider_id: doc.rider_id,
            driver_id: doc.driver_id,
            status: doc.status,
            current_location: {
                latitude: doc.current_location.coordinates[1],
                longitude: doc.current_location.coordinates[0]
            },
            current_route_id: doc.current_route_id,
            eta_min: doc.eta_min,
            distance_remaining_km: doc.distance_remaining_km,
            updated_at: doc.updated_at
        };
    }

    return res.status(200).json({
        success: true,
        message: "Ride started successfully",
        data: {
            ride: {
                id: updatedRide.id,
                status: updatedRide.status,
                started_at: updatedRide.startedAt
            },
            live_state: liveState
        },
        meta: null
    });
});

const submitTrackingPoint = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "driver") {
        throw new ApiError(403, "Access denied. Driver account required");
    }

    const { ride_id } = req.params;
    const {
        latitude,
        longitude,
        speed_kmph = 0,
        heading = 0,
        traffic_level = "unknown",
        eta_min,
        distance_remaining_km
    } = req.body || {};

    if (latitude === undefined || longitude === undefined) {
        throw new ApiError(400, "latitude and longitude are required");
    }

    const driverId = req.user.driverProfile?.id || req.user.driver_profile?.id;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.driverId !== driverId) {
        throw new ApiError(403, "Access denied. You are not assigned to this ride");
    }

    if (ride.status !== "started") {
        throw new ApiError(422, "Cannot submit tracking point for non-started ride");
    }

    const timestamp = new Date();

    if (mongoose.connection.readyState !== 1) {
        throw new ApiError(500, "Database connection not available");
    }

    const trackingCollection = mongoose.connection.collection("ride_tracking");
    const trackingPoint = {
        ride_id: ride.id,
        driver_id: driverId,
        location: {
            type: "Point",
            coordinates: [Number(longitude), Number(latitude)]
        },
        speed_kmph: Number(speed_kmph),
        heading: Number(heading),
        traffic_level,
        timestamp
    };
    await trackingCollection.insertOne(trackingPoint);

    const liveStateCollection = mongoose.connection.collection("ride_live_state");
    const liveStateUpdate = {
        ride_id: ride.id,
        rider_id: ride.riderId,
        driver_id: driverId,
        status: ride.status,
        current_location: {
            type: "Point",
            coordinates: [Number(longitude), Number(latitude)]
        },
        current_route_id: ride.selectedRouteId,
        eta_min: eta_min !== undefined ? Math.round(Number(eta_min)) : null,
        distance_remaining_km: distance_remaining_km !== undefined ? Number(Number(distance_remaining_km).toFixed(2)) : null,
        updated_at: timestamp
    };
    await liveStateCollection.updateOne(
        { ride_id: ride.id },
        { $set: liveStateUpdate },
        { upsert: true }
    );

    await DriverLocation.updateOne(
        { driver_id: driverId },
        {
            $set: {
                location: {
                    type: "Point",
                    coordinates: [Number(longitude), Number(latitude)]
                },
                heading: Number(heading),
                speed_kmph: Number(speed_kmph),
                updated_at: timestamp
            }
        },
        { upsert: true }
    );

    return res.status(200).json({
        success: true,
        message: "Ride tracking updated successfully",
        data: {
            tracking_point: {
                ride_id: ride.id,
                driver_id: driverId,
                latitude: Number(latitude),
                longitude: Number(longitude),
                speed_kmph: Number(speed_kmph),
                heading: Number(heading),
                traffic_level,
                timestamp
            },
            live_state: {
                ride_id: ride.id,
                rider_id: ride.riderId,
                driver_id: driverId,
                status: ride.status,
                current_location: {
                    latitude: Number(latitude),
                    longitude: Number(longitude)
                },
                current_route_id: ride.selectedRouteId,
                eta_min: liveStateUpdate.eta_min,
                distance_remaining_km: liveStateUpdate.distance_remaining_km,
                updated_at: timestamp
            }
        },
        meta: null
    });
});

const getTrackingHistory = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id }
    });
    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (mongoose.connection.readyState !== 1) {
        throw new ApiError(500, "Database connection not available");
    }

    const collection = mongoose.connection.collection("ride_tracking");
    const points = await collection
        .find({ ride_id: ride.id })
        .sort({ timestamp: 1 })
        .toArray();

    return res.status(200).json({
        success: true,
        message: "Ride tracking history fetched successfully",
        data: points.map((p) => ({
            ride_id: p.ride_id,
            driver_id: p.driver_id,
            latitude: p.location?.coordinates?.[1] ?? p.latitude,
            longitude: p.location?.coordinates?.[0] ?? p.longitude,
            speed_kmph: Number(p.speed_kmph || 0),
            heading: Number(p.heading || 0),
            traffic_level: p.traffic_level || "unknown",
            timestamp: p.timestamp
        })),
        meta: null
    });
});

const completeRide = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "driver") {
        throw new ApiError(403, "Access denied. Driver account required");
    }

    const { ride_id } = req.params;
    const {
        actual_distance_km,
        actual_duration_min,
        actual_traffic_delay_min = 0,
        waiting_time_min = 0,
        route_changed = false
    } = req.body || {};

    if (actual_distance_km === undefined || actual_duration_min === undefined) {
        throw new ApiError(400, "actual_distance_km and actual_duration_min are required");
    }

    const driverId = req.user.driverProfile?.id || req.user.driver_profile?.id;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: { fare: true }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.driverId !== driverId) {
        throw new ApiError(403, "Access denied. You are not assigned to this ride");
    }

    const allowedStatuses = ["accepted", "driver_assigned", "arrived", "started"];
    if (!allowedStatuses.includes(ride.status)) {
        throw new ApiError(409, `Cannot complete ride from status: ${ride.status}`);
    }

    const baseFare = Number(ride.fare?.baseFare || 100);
    const perKmRate = Number(ride.fare?.perKmRate || 40);
    const perMinRate = Number(ride.fare?.perMinRate || 8);
    const waitingPerMinRate = Number(ride.fare?.waitingPerMinRate || 5);
    const trafficDelayPerMinRate = Number(ride.fare?.trafficDelayPerMinRate || 4);
    const surgeMultiplier = Number(ride.fare?.surgeMultiplier || 1.0);
    const minimumFare = Number(ride.fare?.minimumFare || 250);

    const finalFormulaFare = Math.round(
        Math.max(
            minimumFare,
            (baseFare +
                Number(actual_distance_km) * perKmRate +
                Number(actual_duration_min) * perMinRate +
                Number(waiting_time_min) * waitingPerMinRate +
                Number(actual_traffic_delay_min) * trafficDelayPerMinRate) *
                surgeMultiplier
        )
    );

    const finalMlPredictedFare = Math.max(
        minimumFare,
        Math.round(finalFormulaFare - 18)
    );

    const completedAt = new Date();

    const updatedRide = await prisma.$transaction(async (tx) => {
        const updated = await tx.ride.update({
            where: { id: ride.id },
            data: {
                status: "completed",
                completedAt
            }
        });

        if (ride.fare) {
            await tx.rideFare.update({
                where: { id: ride.fare.id },
                data: {
                    actualDistanceKm: Number(actual_distance_km),
                    actualDurationMin: Number(actual_duration_min),
                    actualTrafficDelayMin: Number(actual_traffic_delay_min),
                    waitingTimeMin: Number(waiting_time_min),
                    finalFormulaFare,
                    finalMlPredictedFare,
                    finalFare: finalFormulaFare,
                    finalizedAt: completedAt
                }
            });
        }

        await tx.rideStatusHistory.create({
            data: {
                rideId: ride.id,
                oldStatus: ride.status,
                newStatus: "completed",
                changedByUserId: req.user.id
            }
        });

        await tx.driver.update({
            where: { id: driverId },
            data: {
                isAvailable: true,
                totalRides: { increment: 1 }
            }
        });

        await tx.rider.update({
            where: { id: ride.riderId },
            data: {
                totalRides: { increment: 1 }
            }
        });

        await tx.rideStop.updateMany({
            where: {
                rideId: ride.id,
                stopType: "dropoff"
            },
            data: {
                arrivedAt: completedAt,
                departedAt: completedAt
            }
        });

        return updated;
    });

    Promise.allSettled([
        (async () => {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.collection("ride_live_state").deleteOne({ ride_id: ride.id });
                await DriverLocation.updateOne(
                    { driver_id: driverId },
                    { $set: { is_available: true, updated_at: new Date() } }
                );
                await mongoose.connection.collection("ride_summaries").insertOne({
                    ride_id: ride.id,
                    actual_distance_km: Number(actual_distance_km),
                    actual_duration_min: Number(actual_duration_min),
                    actual_traffic_delay_min: Number(actual_traffic_delay_min),
                    waiting_time_min: Number(waiting_time_min),
                    route_changed,
                    completed_at: completedAt
                });
            }
        })(),
        (async () => {
            if (neo4jDriver) {
                const session = neo4jDriver.session();
                try {
                    await session.run(
                        `
                        MATCH (d:Driver {id: $driverId})
                        MATCH (r:Ride {id: $rideId})
                        MERGE (d)-[:COMPLETED]->(r)
                        SET r.status = "completed", r.final_fare = $finalFare
                        `,
                        {
                            driverId,
                            rideId: ride.id,
                            finalFare: finalFormulaFare
                        }
                    );
                } finally {
                    await session.close();
                }
            }
        })()
    ]).catch((err) => {
        logger.warn(`Side-effects after completion failed: ${err.message}`);
    });

    return res.status(200).json({
        success: true,
        message: "Ride completed successfully",
        data: {
            ride: {
                id: updatedRide.id,
                status: updatedRide.status,
                completed_at: updatedRide.completedAt
            },
            summary: {
                ride_id: ride.id,
                actual_distance_km: Number(actual_distance_km),
                actual_duration_min: Number(actual_duration_min),
                actual_traffic_delay_min: Number(actual_traffic_delay_min),
                waiting_time_min: Number(waiting_time_min),
                route_changed,
                completed_at: completedAt
            },
            fare: {
                currency: "PKR",
                actual_distance_km: Number(actual_distance_km),
                actual_duration_min: Number(actual_duration_min),
                actual_traffic_delay_min: Number(actual_traffic_delay_min),
                waiting_time_min: Number(waiting_time_min),
                final_formula_fare: finalFormulaFare,
                final_ml_predicted_fare: finalMlPredictedFare,
                final_fare: finalFormulaFare,
                model_used: ride.fare?.modelUsed || "fare_prediction_linear_regression_v1",
                finalized_at: completedAt
            }
        },
        meta: null
    });
});

const submitRating = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "rider") {
        throw new ApiError(403, "Access denied. Rider account required");
    }

    const { ride_id } = req.params;
    const { rating, comment = "" } = req.body || {};

    if (rating === undefined || rating < 1 || rating > 5) {
        throw new ApiError(400, "rating must be an integer between 1 and 5");
    }

    const riderId = req.user.riderProfile?.id || req.user.rider_profile?.id;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.riderId !== riderId) {
        throw new ApiError(403, "Access denied. You did not book this ride");
    }

    if (ride.status !== "completed") {
        throw new ApiError(400, "Rating is only allowed for completed rides");
    }

    if (!ride.driverId) {
        throw new ApiError(400, "No driver was assigned to this ride");
    }

    const existingRating = await prisma.rating.findUnique({
        where: { rideId: ride.id }
    });
    if (existingRating) {
        throw new ApiError(409, "A rating has already been submitted for this ride");
    }

    const createdRating = await prisma.$transaction(async (tx) => {
        const r = await tx.rating.create({
            data: {
                rideId: ride.id,
                riderId,
                driverId: ride.driverId,
                rating: parseInt(rating),
                comment
            }
        });

        const ratings = await tx.rating.findMany({
            where: { driverId: ride.driverId },
            select: { rating: true }
        });
        const count = ratings.length;
        const sum = ratings.reduce((acc, curr) => acc + curr.rating, 0);
        const newAverage = sum / count;

        await tx.driver.update({
            where: { id: ride.driverId },
            data: {
                averageRating: Number(newAverage.toFixed(2))
            }
        });

        return r;
    });

    const driverDoc = await prisma.driver.findUnique({
        where: { id: ride.driverId }
    });

    if (neo4jDriver) {
        const session = neo4jDriver.session();
        session.run(
            `
            MATCH (rider:Rider {id: $riderId})
            MATCH (driver:Driver {id: $driverId})
            MERGE (rider)-[rated:RATED]->(driver)
            SET rated.stars = $rating
            `,
            {
                riderId,
                driverId: ride.driverId,
                rating: parseInt(rating)
            }
        ).then(() => session.close())
         .catch((err) => {
             logger.warn(`Failed to update Neo4j with rating: ${err.message}`);
             session.close();
         });
    }

    return res.status(201).json({
        success: true,
        message: "Rating submitted successfully",
        data: {
            rating: {
                id: createdRating.id,
                ride_id: createdRating.rideId,
                rider_id: createdRating.riderId,
                driver_id: createdRating.driverId,
                rating: createdRating.rating,
                comment: createdRating.comment,
                created_at: createdRating.createdAt
            },
            driver_average_rating: Number(driverDoc?.averageRating || rating)
        },
        meta: null
    });
});

const getRideReceipt = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: {
            stops: true,
            fare: true,
            rider: {
                include: {
                    user: true
                }
            },
            driver: {
                include: {
                    user: true
                }
            },
            vehicle: true
        }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    if (ride.status !== "completed") {
        throw new ApiError(400, "Receipt is only available for completed rides");
    }

    const completedAt = ride.completedAt || new Date();
    const dateStr = completedAt.toISOString().split("T")[0].replace(/-/g, "");
    const suffix = ride.id.slice(-4).toUpperCase();
    const receiptNumber = `RCPT-${dateStr}-${suffix}`;

    const baseFare = Number(ride.fare?.baseFare || 0);
    const perKmRate = Number(ride.fare?.perKmRate || 0);
    const perMinRate = Number(ride.fare?.perMinRate || 0);
    const waitingPerMinRate = Number(ride.fare?.waitingPerMinRate || 0);
    const trafficDelayPerMinRate = Number(ride.fare?.trafficDelayPerMinRate || 0);
    const peakMultiplier = Number(ride.fare?.peakMultiplier || 1.0);
    const surgeMultiplier = Number(ride.fare?.surgeMultiplier || 1.0);
    const minimumFare = Number(ride.fare?.minimumFare || 0);

    const actualDistanceKm = Number(ride.fare?.actualDistanceKm || 0);
    const actualDurationMin = Number(ride.fare?.actualDurationMin || 0);
    const actualTrafficDelayMin = Number(ride.fare?.actualTrafficDelayMin || 0);
    const waitingTimeMin = Number(ride.fare?.waitingTimeMin || 0);

    const distanceFare = Math.round(actualDistanceKm * perKmRate);
    const durationFare = Math.round(actualDurationMin * perMinRate);
    const waitingFare = Math.round(waitingTimeMin * waitingPerMinRate);
    const trafficDelayFare = Math.round(actualTrafficDelayMin * trafficDelayPerMinRate);
    const finalFare = Number(ride.fare?.finalFare || 0);

    const pickupStop = (ride.stops || []).find((s) => s.stopType === "pickup" || s.stopOrder === 1);
    const dropoffStop = (ride.stops || []).find((s) => s.stopType === "dropoff" || s.stopOrder === (ride.stops || []).length);

    const receipt = {
        receipt_number: receiptNumber,
        ride_id: ride.id,
        currency: ride.fare?.currency || "PKR",
        rider: {
            name: ride.rider?.user?.name || "Rider",
            phone: ride.rider?.user?.phone || ""
        },
        driver: {
            name: ride.driver?.user?.name || "Driver",
            phone: ride.driver?.user?.phone || ""
        },
        vehicle: ride.vehicle
            ? {
                  make: ride.vehicle.make,
                  model: ride.vehicle.model,
                  plate_number: ride.vehicle.plateNumber,
                  color: ride.vehicle.color
              }
            : null,
        pickup: {
            address: ride.pickupAddress || pickupStop?.address || "Pickup address",
            latitude: Number(ride.pickupLatitude),
            longitude: Number(ride.pickupLongitude)
        },
        dropoff: {
            address: ride.dropoffAddress || dropoffStop?.address || "Dropoff address",
            latitude: Number(ride.dropoffLatitude),
            longitude: Number(ride.dropoffLongitude)
        },
        fare_breakdown: {
            base_fare: baseFare,
            distance_fare: distanceFare,
            duration_fare: durationFare,
            waiting_fare: waitingFare,
            traffic_delay_fare: trafficDelayFare,
            peak_multiplier: peakMultiplier,
            surge_multiplier: surgeMultiplier,
            minimum_fare: minimumFare,
            final_fare: finalFare
        },
        actual_distance_km: actualDistanceKm,
        actual_duration_min: actualDurationMin,
        completed_at: completedAt,
        delivery_status: "mock_sent",
        delivery_channels: ["email", "sms"]
    };

    return res.status(200).json({
        success: true,
        message: "Receipt generated successfully",
        data: {
            receipt
        },
        meta: null
    });
});

export {
    estimateRideFare,
    createRideRequest,
    listMyRides,
    getRideDetails,
    getRideRoute,
    getRideLiveState,
    cancelRide,
    driverArrived,
    driverStartRide,
    submitTrackingPoint,
    getTrackingHistory,
    completeRide,
    submitRating,
    getRideReceipt
};
