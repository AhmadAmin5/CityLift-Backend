import { prisma } from "../db/postgres.js";
import DriverLocation from "../models/driverLocation.model.js";
import SurgeZone from "../models/surgeZone.model.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { reverseGeocode as mapboxReverseGeocode } from "../services/mapbox.service.js";

import { getGoogleRouteDirections } from "../services/googleRoutes.service.js";
import { googlePlacesAutocomplete, getGooglePlaceDetails } from "../services/googlePlaces.service.js";

// Haversine distance utility
const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
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

// Static Lahore locations fallback for autocomplete
const defaultLahorePlaces = [
    {
        provider: "mapbox",
        provider_place_id: "mapbox.place.gulberg",
        name: "Gulberg",
        address: "Gulberg, Lahore, Pakistan",
        latitude: 31.5204,
        longitude: 74.3587
    },
    {
        provider: "mapbox",
        provider_place_id: "mapbox.place.dha",
        name: "DHA Phase 5",
        address: "DHA Phase 5, Lahore, Pakistan",
        latitude: 31.4697,
        longitude: 74.4085
    },
    {
        provider: "mapbox",
        provider_place_id: "mapbox.place.johar_town",
        name: "Johar Town",
        address: "Johar Town, Lahore, Pakistan",
        latitude: 31.4697,
        longitude: 74.2728
    },
    {
        provider: "mapbox",
        provider_place_id: "mapbox.place.mall_road",
        name: "Mall Road",
        address: "Mall Road, Lahore, Pakistan",
        latitude: 31.558,
        longitude: 74.35
    },
    {
        provider: "mapbox",
        provider_place_id: "mapbox.place.airport",
        name: "Allama Iqbal International Airport",
        address: "Airport Road, Lahore, Pakistan",
        latitude: 31.5216,
        longitude: 74.4036
    }
];

/**
 * 12.1 Get Mapbox Config
 */
const getMapConfig = asyncHandler(async (req, res) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN || "pk.mock_token_for_citylift";

    return res.status(200).json({
        success: true,
        message: "Map config fetched successfully",
        data: {
            provider: "mapbox",
            public_token: token,
            default_center: {
                latitude: 31.5204,
                longitude: 74.3587
            },
            default_zoom: 12
        },
        meta: null
    });
});

/**
 * 12.2 Places Autocomplete
 */
const autocomplete = asyncHandler(async (req, res) => {
    const { query, latitude, longitude, limit, session_token, type_preset } = req.query;

    if (!query) {
        throw new ApiError(400, "Query parameter is required");
    }

    const searchLimit = limit ? Math.min(Number(limit), 10) : 5;

    const lat = latitude !== undefined && Number.isFinite(Number(latitude)) ? Number(latitude) : undefined;

    const lon = longitude !== undefined && Number.isFinite(Number(longitude)) ? Number(longitude) : undefined;

    const data = await googlePlacesAutocomplete({
        query,
        latitude: lat,
        longitude: lon,
        limit: searchLimit,
        sessionToken: session_token,
        typePreset: type_preset || "all"
    });

    return res.status(200).json({
        success: true,
        message: "Autocomplete results fetched successfully",
        data,
        meta: {
            provider: "google",
            city: "Lahore",
            country: "PK",
            requires_place_details: true,
            session_token: session_token || null
        }
    });
});

/**
 * 12.2b Place Details
 */
const placeDetails = asyncHandler(async (req, res) => {
    const { place_id, session_token } = req.query;

    if (!place_id) {
        throw new ApiError(400, "place_id query parameter is required");
    }

    const data = await getGooglePlaceDetails(place_id, session_token);

    if (!data) {
        throw new ApiError(404, "Place details not found");
    }

    if (data.latitude === null || data.longitude === null) {
        throw new ApiError(422, "Selected place does not have coordinates");
    }

    return res.status(200).json({
        success: true,
        message: "Place details fetched successfully",
        data,
        meta: {
            provider: "google",
            session_token: session_token || null
        }
    });
});

/**
 * 12.3 Reverse Geocode
 */
const reverseGeocode = asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.query;

    if (latitude === undefined || longitude === undefined) {
        throw new ApiError(400, "Latitude and longitude query parameters are required");
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    let data = await mapboxReverseGeocode(lat, lon);

    // Fallback to closest predefined place or generate a dynamic one
    if (!data) {
        let closest = defaultLahorePlaces[0];
        let minDist = Infinity;

        for (const place of defaultLahorePlaces) {
            const dist = haversineDistance(lat, lon, place.latitude, place.longitude);
            if (dist < minDist) {
                minDist = dist;
                closest = place;
            }
        }

        // If the closest place is within 2 km, use its details, otherwise build a generic coordinate address
        if (minDist <= 2.0) {
            data = {
                ...closest,
                latitude: lat,
                longitude: lon
            };
        } else {
            data = {
                provider: "mapbox",
                provider_place_id: `mapbox.place.reverse.${Math.floor(Math.random() * 100000)}`,
                name: "Manually Selected Pin",
                address: `Lahore, Pakistan (Lat: ${lat.toFixed(4)}, Lng: ${lon.toFixed(4)})`,
                latitude: lat,
                longitude: lon
            };
        }
    }

    return res.status(200).json({
        success: true,
        message: "Address fetched successfully",
        data,
        meta: null
    });
});

/**
 * 12.4 Get Route Preview
 */
const getRoutePreview = asyncHandler(async (req, res) => {
    const { origin, destination, stops, vehicle_type } = req.body;

    if (!origin || !destination) {
        throw new ApiError(400, "Origin and destination are required in the request body");
    }

    if (
        origin.latitude === undefined ||
        origin.longitude === undefined ||
        destination.latitude === undefined ||
        destination.longitude === undefined
    ) {
        throw new ApiError(400, "Origin and destination coordinates are required");
    }

    const intermediateStops = Array.isArray(stops) ? stops : [];
    const vehicleType = vehicle_type || "car";

    let data = await getGoogleRouteDirections(origin, destination, intermediateStops, vehicleType);

    // Fallback mock routing if Mapbox fails or isn't configured
    if (!data) {
        throw new ApiError(503, "Route preview is currently unavailable. Please try again.");
    } else {
        // Envelop route field to match contract
        data = {
            route: data
        };
    }

    return res.status(200).json({
        success: true,
        message: "Route preview fetched successfully",
        data,
        meta: null
    });
});

/**
 * 12.5 Nearby Drivers
 */
const getNearbyDrivers = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "rider") {
        throw new ApiError(403, "Access denied. Rider account required");
    }

    const { latitude, longitude, radius_km } = req.query;

    if (latitude === undefined || longitude === undefined) {
        throw new ApiError(400, "Latitude and longitude query parameters are required");
    }

    const lat = Number(latitude);
    const lon = Number(longitude);
    const radius = radius_km ? Number(radius_km) : 3;

    let drivers = await DriverLocation.find({
        is_available: true,
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [lon, lat]
                },
                $maxDistance: radius * 1000
            }
        }
    });

    let formattedDrivers = [];

    // Fallback: Populate or use mock drivers if no drivers found
    if (drivers.length === 0) {
        const dbDrivers = await prisma.driver.findMany({
            where: {
                approvalStatus: "approved"
            },
            include: {
                vehicles: {
                    where: { isActive: true }
                }
            }
        });

        if (dbDrivers.length > 0) {
            const upsertPromises = dbDrivers.map(async (drv, idx) => {
                const angle = (idx * 2 * Math.PI) / dbDrivers.length;
                const offsetDist = 0.5 + Math.random() * 1.5;
                const latOffset = (offsetDist * Math.sin(angle)) / 111;
                const lonOffset = (offsetDist * Math.cos(angle)) / (111 * Math.cos((lat * Math.PI) / 180));

                const drvLat = lat + latOffset;
                const drvLon = lon + lonOffset;

                const vehicle = drv.vehicles[0];
                const vehicleId = vehicle ? vehicle.id : "mock-vehicle-id";

                const locData = {
                    driver_id: drv.id,
                    vehicle_id: vehicleId,
                    is_available: true,
                    average_rating: Number(drv.averageRating) || 5.0,
                    location: {
                        type: "Point",
                        coordinates: [drvLon, drvLat]
                    },
                    heading: Math.floor(Math.random() * 360),
                    speed_kmph: Math.floor(Math.random() * 30) + 10,
                    current_area: "Gulberg",
                    updated_at: new Date()
                };

                await DriverLocation.findOneAndUpdate({ driver_id: drv.id }, locData, {
                    upsert: true,
                    new: true
                });

                return {
                    driver_id: drv.id,
                    vehicle_id: vehicleId,
                    is_available: true,
                    average_rating: Number(drv.averageRating) || 5.0,
                    latitude: drvLat,
                    longitude: drvLon,
                    heading: locData.heading,
                    speed_kmph: locData.speed_kmph,
                    current_area: locData.current_area,
                    distance_km: Number(offsetDist.toFixed(2)),
                    updated_at: locData.updated_at
                };
            });

            formattedDrivers = await Promise.all(upsertPromises);
        } else {
            // No drivers in PostgreSQL either, return fully mocked drivers
            formattedDrivers = [
                {
                    driver_id: "7ac72c6b-28f7-4b72-b7e6-234b67cf90a1",
                    vehicle_id: "8bc82c7c-39f8-5b83-c8f7-345c78df01b2",
                    is_available: true,
                    average_rating: 4.8,
                    latitude: lat + 0.003,
                    longitude: lon + 0.002,
                    heading: 120,
                    speed_kmph: 15,
                    current_area: "Gulberg",
                    distance_km: haversineDistance(lat, lon, lat + 0.003, lon + 0.002),
                    updated_at: new Date()
                },
                {
                    driver_id: "9ba82d8c-49f9-6c94-d9f8-456d89ef12c3",
                    vehicle_id: "0cd93d9d-50fa-7da5-e0f9-567e90fa23d4",
                    is_available: true,
                    average_rating: 4.9,
                    latitude: lat - 0.004,
                    longitude: lon - 0.003,
                    heading: 270,
                    speed_kmph: 25,
                    current_area: "Gulberg",
                    distance_km: haversineDistance(lat, lon, lat - 0.004, lon - 0.003),
                    updated_at: new Date()
                }
            ];
        }
    } else {
        formattedDrivers = drivers.map((driver) => {
            const driverLon = driver.location.coordinates[0];
            const driverLat = driver.location.coordinates[1];
            const dist = haversineDistance(lat, lon, driverLat, driverLon);

            return {
                driver_id: driver.driver_id,
                vehicle_id: driver.vehicle_id,
                is_available: driver.is_available,
                average_rating: Number(driver.average_rating),
                latitude: driverLat,
                longitude: driverLon,
                heading: driver.heading,
                speed_kmph: driver.speed_kmph,
                current_area: driver.current_area,
                distance_km: dist,
                updated_at: driver.updated_at
            };
        });
    }

    return res.status(200).json({
        success: true,
        message: "Nearby drivers fetched successfully",
        data: formattedDrivers,
        meta: null
    });
});

/**
 * 12.6 Surge Zones / Demand Heatmap
 */
const getSurgeZones = asyncHandler(async (req, res) => {
    const city = req.query.city || "Lahore";

    let zones = await SurgeZone.find({ city: { $regex: new RegExp(`^${city}$`, "i") } });

    // Seed default surge zones for Lahore if MongoDB is empty
    if (zones.length === 0 && city.toLowerCase() === "lahore") {
        const defaultZones = [
            {
                zone_id: "lahore_gulberg",
                city: "Lahore",
                area_name: "Gulberg",
                center: { latitude: 31.5204, longitude: 74.3587 },
                radius_km: 3,
                demand_count: 25,
                available_drivers: 8,
                supply_demand_ratio: 3.13,
                surge_multiplier: 1.5,
                updated_at: new Date()
            },
            {
                zone_id: "lahore_dha",
                city: "Lahore",
                area_name: "DHA Phase 5",
                center: { latitude: 31.4697, longitude: 74.4085 },
                radius_km: 4,
                demand_count: 15,
                available_drivers: 10,
                supply_demand_ratio: 1.5,
                surge_multiplier: 1.2,
                updated_at: new Date()
            },
            {
                zone_id: "lahore_johar_town",
                city: "Lahore",
                area_name: "Johar Town",
                center: { latitude: 31.4697, longitude: 74.2728 },
                radius_km: 3.5,
                demand_count: 20,
                available_drivers: 9,
                supply_demand_ratio: 2.22,
                surge_multiplier: 1.3,
                updated_at: new Date()
            }
        ];

        await SurgeZone.insertMany(defaultZones);
        zones = await SurgeZone.find({ city: { $regex: new RegExp(`^${city}$`, "i") } });
    }

    const formattedZones = zones.map((zone) => ({
        id: zone.zone_id,
        city: zone.city,
        area_name: zone.area_name,
        center: {
            latitude: zone.center.latitude,
            longitude: zone.center.longitude
        },
        radius_km: zone.radius_km,
        demand_count: zone.demand_count,
        available_drivers: zone.available_drivers,
        supply_demand_ratio: zone.supply_demand_ratio,
        surge_multiplier: zone.surge_multiplier,
        updated_at: zone.updated_at
    }));

    return res.status(200).json({
        success: true,
        message: "Surge zones fetched successfully",
        data: formattedZones,
        meta: null
    });
});

export {
    getMapConfig,
    autocomplete,
    placeDetails,
    reverseGeocode,
    getRoutePreview,
    getNearbyDrivers,
    getSurgeZones
};
