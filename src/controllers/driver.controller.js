import crypto from "node:crypto";
import mongoose from "mongoose";

import { driver as neo4jDriver } from "../db/neo4j.js";
import { getGoogleRouteDirections } from "../services/googleRoutes.service.js";
import logger from "../utils/logger.js";


import { prisma } from "../db/postgres.js";

import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

import DriverLocation from "../models/driverLocation.model.js";

import { updateDriverCurrentArea } from "../services/neo4j/driverArea.service.js";

import { uploadToCloudinary } from "../utils/cloudinary.js";

const getCurrentDriverProfile = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        },
        include: {
            user: true,
            vehicles: {
                where: {
                    isActive: true
                },
                take: 1
            }
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const activeVehicle = driver.vehicles?.[0] || null;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                driver: {
                    id: driver.id,
                    user_id: driver.userId,
                    average_rating: Number(driver.averageRating),
                    total_rides: driver.totalRides,
                    is_available: driver.isAvailable,
                    approval_status: driver.approvalStatus,

                    user: {
                        id: driver.user.id,
                        name: driver.user.name,
                        email: driver.user.email,
                        phone: driver.user.phone,
                        role: driver.user.role,
                        profile_photo_url: driver.user.profilePhotoUrl,
                        email_verified_at: driver.user.emailVerifiedAt,
                        phone_verified_at: driver.user.phoneVerifiedAt,
                        created_at: driver.user.createdAt,
                        updated_at: driver.user.updatedAt
                    },

                    active_vehicle: activeVehicle
                        ? {
                              id: activeVehicle.id,
                              driver_id: activeVehicle.driverId,
                              make: activeVehicle.make,
                              model: activeVehicle.model,
                              year: activeVehicle.year,
                              plate_number: activeVehicle.plateNumber,
                              color: activeVehicle.color,
                              vehicle_type: activeVehicle.vehicleType,
                              is_active: activeVehicle.isActive,
                              verification_status: activeVehicle.verificationStatus,
                              created_at: activeVehicle.createdAt,
                              updated_at: activeVehicle.updatedAt
                          }
                        : null
                }
            },
            "Driver profile fetched successfully"
        )
    );
});

const updateDriverAvailability = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { is_available, latitude, longitude, heading = 0, speed_kmph = 0, current_area = null } = req.body;

    // Validation

    if (typeof is_available !== "boolean") {
        throw new ApiError(400, "is_available must be boolean");
    }

    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
        throw new ApiError(400, "Invalid latitude");
    }

    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
        throw new ApiError(400, "Invalid longitude");
    }

    if (heading < 0 || heading > 360) {
        throw new ApiError(400, "Invalid heading");
    }

    if (speed_kmph < 0) {
        throw new ApiError(400, "speed_kmph cannot be negative");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        },
        include: {
            vehicles: {
                where: {
                    isActive: true,
                    verificationStatus: "approved"
                },
                take: 1
            }
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver not found");
    }

    // Driver can become available only if approved

    if (is_available === true) {
        if (driver.approvalStatus !== "approved") {
            throw new ApiError(400, "Driver account is not approved");
        }

        if (!driver.vehicles.length) {
            throw new ApiError(400, "Driver must have one active approved vehicle");
        }
    }

    const activeVehicle = driver.vehicles?.[0] || null;

    // Update PostgreSQL

    const updatedDriver = await prisma.driver.update({
        where: {
            id: driver.id
        },
        data: {
            isAvailable: is_available
        }
    });

    let locationDocument = null;

    // Update MongoDB location

    if (activeVehicle && latitude !== undefined && longitude !== undefined) {
        locationDocument = await DriverLocation.findOneAndUpdate(
            {
                driver_id: driver.id
            },
            {
                driver_id: driver.id,
                vehicle_id: activeVehicle.id,
                is_available,
                average_rating: Number(driver.averageRating),

                location: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                },

                heading,
                speed_kmph,
                current_area,
                updated_at: new Date()
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );
    }

    // Update Neo4j

    if (current_area) {
        await updateDriverCurrentArea({
            driverId: driver.id,
            currentArea: current_area
        });
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                driver: {
                    id: updatedDriver.id,
                    is_available: updatedDriver.isAvailable,
                    approval_status: updatedDriver.approvalStatus
                },

                location: locationDocument
                    ? {
                          driver_id: locationDocument.driver_id,
                          vehicle_id: locationDocument.vehicle_id,
                          is_available: locationDocument.is_available,
                          average_rating: locationDocument.average_rating,
                          latitude: locationDocument.location.coordinates[1],
                          longitude: locationDocument.location.coordinates[0],
                          heading: locationDocument.heading,
                          speed_kmph: locationDocument.speed_kmph,
                          current_area: locationDocument.current_area,
                          updated_at: locationDocument.updated_at
                      }
                    : null
            },
            "Driver availability updated successfully"
        )
    );
});

const updateDriverLocation = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { latitude, longitude, heading = 0, speed_kmph = 0, current_area = null } = req.body;

    // Validation

    if (latitude === undefined || longitude === undefined) {
        throw new ApiError(400, "latitude and longitude are required");
    }

    if (latitude < -90 || latitude > 90) {
        throw new ApiError(400, "Invalid latitude");
    }

    if (longitude < -180 || longitude > 180) {
        throw new ApiError(400, "Invalid longitude");
    }

    if (heading < 0 || heading > 360) {
        throw new ApiError(400, "Invalid heading");
    }

    if (speed_kmph < 0) {
        throw new ApiError(400, "speed_kmph cannot be negative");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        },
        include: {
            vehicles: {
                where: {
                    isActive: true,
                    verificationStatus: "approved"
                },
                take: 1
            }
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver not found");
    }

    if (!driver.vehicles.length) {
        throw new ApiError(400, "Driver must have one active approved vehicle");
    }

    const activeVehicle = driver.vehicles[0];

    const existingLocation = await DriverLocation.findOne({
        driver_id: driver.id
    });

    const previousArea = existingLocation?.current_area || null;

    // Update MongoDB

    const locationDocument = await DriverLocation.findOneAndUpdate(
        {
            driver_id: driver.id
        },
        {
            driver_id: driver.id,
            vehicle_id: activeVehicle.id,
            is_available: driver.isAvailable,
            average_rating: Number(driver.averageRating),

            location: {
                type: "Point",
                coordinates: [longitude, latitude]
            },

            heading,
            speed_kmph,
            current_area,
            updated_at: new Date()
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );

    // Update Neo4j only if area changed

    if (current_area && previousArea !== current_area) {
        await updateDriverCurrentArea({
            driverId: driver.id,
            currentArea: current_area
        });
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                location: {
                    driver_id: locationDocument.driver_id,
                    vehicle_id: locationDocument.vehicle_id,
                    is_available: locationDocument.is_available,
                    average_rating: locationDocument.average_rating,
                    latitude: locationDocument.location.coordinates[1],
                    longitude: locationDocument.location.coordinates[0],
                    heading: locationDocument.heading,
                    speed_kmph: locationDocument.speed_kmph,
                    current_area: locationDocument.current_area,
                    updated_at: locationDocument.updated_at
                }
            },
            "Driver location updated successfully"
        )
    );
});

const getDriverDocuments = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const documents = await prisma.driverDocument.findMany({
        where: {
            driverId: driver.id
        },
        orderBy: {
            uploadedAt: "desc"
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            documents.map((document) => ({
                id: document.id,
                driver_id: document.driverId,
                vehicle_id: document.vehicleId,
                document_type: document.documentType,
                file_url: document.fileUrl,
                status: document.status,
                rejection_reason: document.rejectionReason,
                uploaded_at: document.uploadedAt,
                verified_at: document.verifiedAt
            })),
            "Driver documents fetched successfully"
        )
    );
});

const uploadDriverDocument = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { document_type, vehicle_id } = req.body;

    if (!document_type) {
        throw new ApiError(400, "document_type is required");
    }

    const allowedDocumentTypes = ["cnic", "license", "vehicle_registration"];

    if (!allowedDocumentTypes.includes(document_type)) {
        throw new ApiError(400, "Invalid document_type");
    }

    if (document_type === "vehicle_registration" && !vehicle_id) {
        throw new ApiError(400, "vehicle_id is required for vehicle_registration document");
    }

    if (!req.file) {
        throw new ApiError(400, "Document file is required");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    let vehicle = null;

    if (vehicle_id) {
        vehicle = await prisma.vehicle.findFirst({
            where: {
                id: vehicle_id,
                driverId: driver.id
            }
        });

        if (!vehicle) {
            throw new ApiError(404, "Vehicle not found");
        }
    }

    const uploadedFile = await uploadToCloudinary(req.file.buffer, "driver-documents");

    const document = await prisma.driverDocument.create({
        data: {
            driverId: driver.id,
            vehicleId: vehicle?.id || null,
            documentType: document_type,
            fileUrl: uploadedFile.secure_url,
            status: "pending"
        }
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                document: {
                    id: document.id,
                    driver_id: document.driverId,
                    vehicle_id: document.vehicleId,
                    document_type: document.documentType,
                    file_url: document.fileUrl,
                    status: document.status,
                    rejection_reason: document.rejectionReason,
                    uploaded_at: document.uploadedAt,
                    verified_at: document.verifiedAt
                }
            },
            "Driver document uploaded successfully"
        )
    );
});

const getMyVehicles = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const vehicles = await prisma.vehicle.findMany({
        where: {
            driverId: driver.id
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            vehicles.map((vehicle) => ({
                id: vehicle.id,
                driver_id: vehicle.driverId,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                plate_number: vehicle.plateNumber,
                color: vehicle.color,
                vehicle_type: vehicle.vehicleType,
                is_active: vehicle.isActive,
                verification_status: vehicle.verificationStatus,
                created_at: vehicle.createdAt,
                updated_at: vehicle.updatedAt
            })),
            "Vehicles fetched successfully"
        )
    );
});

const createVehicle = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { make, model, year, plate_number, color, vehicle_type } = req.body;

    if (!make || !model || !plate_number || !vehicle_type) {
        throw new ApiError(400, "make, model, plate_number and vehicle_type are required");
    }

    const allowedVehicleTypes = ["car", "bike", "rickshaw"];

    if (!allowedVehicleTypes.includes(vehicle_type)) {
        throw new ApiError(400, "Invalid vehicle_type");
    }

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const existingVehicle = await prisma.vehicle.findUnique({
        where: {
            plateNumber: plate_number
        }
    });

    if (existingVehicle) {
        throw new ApiError(400, "Vehicle with this plate number already exists");
    }

    const vehicle = await prisma.vehicle.create({
        data: {
            driverId: driver.id,
            make,
            model,
            year,
            plateNumber: plate_number,
            color,
            vehicleType: vehicle_type,
            isActive: false,
            verificationStatus: "pending"
        }
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                vehicle: {
                    id: vehicle.id,
                    driver_id: vehicle.driverId,
                    make: vehicle.make,
                    model: vehicle.model,
                    year: vehicle.year,
                    plate_number: vehicle.plateNumber,
                    color: vehicle.color,
                    vehicle_type: vehicle.vehicleType,
                    is_active: vehicle.isActive,
                    verification_status: vehicle.verificationStatus,
                    created_at: vehicle.createdAt,
                    updated_at: vehicle.updatedAt
                }
            },
            "Vehicle created successfully"
        )
    );
});

const updateVehicle = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { vehicle_id } = req.params;

    const { make, model, year, plate_number, color, vehicle_type } = req.body;

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const vehicle = await prisma.vehicle.findFirst({
        where: {
            id: vehicle_id,
            driverId: driver.id
        }
    });

    if (!vehicle) {
        throw new ApiError(404, "Vehicle not found");
    }

    if (vehicle_type) {
        const allowedVehicleTypes = ["car", "bike", "rickshaw"];

        if (!allowedVehicleTypes.includes(vehicle_type)) {
            throw new ApiError(400, "Invalid vehicle_type");
        }
    }

    if (plate_number && plate_number !== vehicle.plateNumber) {
        const existingVehicle = await prisma.vehicle.findUnique({
            where: {
                plateNumber: plate_number
            }
        });

        if (existingVehicle) {
            throw new ApiError(400, "Vehicle with this plate number already exists");
        }
    }

    const updatedVehicle = await prisma.vehicle.update({
        where: {
            id: vehicle.id
        },
        data: {
            make: make ?? vehicle.make,
            model: model ?? vehicle.model,
            year: year ?? vehicle.year,
            plateNumber: plate_number ?? vehicle.plateNumber,
            color: color ?? vehicle.color,
            vehicleType: vehicle_type ?? vehicle.vehicleType,

            // Re-verification required after update
            verificationStatus: "pending",
            isActive: false
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                vehicle: {
                    id: updatedVehicle.id,
                    driver_id: updatedVehicle.driverId,
                    make: updatedVehicle.make,
                    model: updatedVehicle.model,
                    year: updatedVehicle.year,
                    plate_number: updatedVehicle.plateNumber,
                    color: updatedVehicle.color,
                    vehicle_type: updatedVehicle.vehicleType,
                    is_active: updatedVehicle.isActive,
                    verification_status: updatedVehicle.verificationStatus,
                    created_at: updatedVehicle.createdAt,
                    updated_at: updatedVehicle.updatedAt
                }
            },
            "Vehicle updated successfully"
        )
    );
});

const setActiveVehicle = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { vehicle_id } = req.params;

    const driver = await prisma.driver.findUnique({
        where: {
            userId: user.id
        }
    });

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const vehicle = await prisma.vehicle.findFirst({
        where: {
            id: vehicle_id,
            driverId: driver.id
        }
    });

    if (!vehicle) {
        throw new ApiError(404, "Vehicle not found");
    }

    // Uncomment this block in production if only approved vehicles should become active

    /*
    if (vehicle.verificationStatus !== "approved") {
        throw new ApiError(
            400,
            "Only approved vehicles can be set active"
        );
    }
    */

    await prisma.vehicle.updateMany({
        where: {
            driverId: driver.id
        },
        data: {
            isActive: false
        }
    });

    const updatedVehicle = await prisma.vehicle.update({
        where: {
            id: vehicle.id
        },
        data: {
            isActive: true
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                vehicle: {
                    id: updatedVehicle.id,
                    driver_id: updatedVehicle.driverId,
                    make: updatedVehicle.make,
                    model: updatedVehicle.model,
                    year: updatedVehicle.year,
                    plate_number: updatedVehicle.plateNumber,
                    color: updatedVehicle.color,
                    vehicle_type: updatedVehicle.vehicleType,
                    is_active: updatedVehicle.isActive,
                    verification_status: updatedVehicle.verificationStatus,
                    created_at: updatedVehicle.createdAt,
                    updated_at: updatedVehicle.updatedAt
                }
            },
            "Active vehicle updated successfully"
        )
    );
});


//----------------------------------------


const RIDE_OFFER_COLLECTION = "ride_routes";
const ALLOWED_RIDE_OFFER_STATUSES = new Set(["sent", "accepted", "declined", "expired"]);

const toSafeNumber = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
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
    return Number((R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))).toFixed(2));
};

const serializeRideFareForOffer = (fare) => {
    if (!fare) return null;

    return {
        currency: fare.currency,
        estimated_min_fare: toSafeNumber(fare.estimatedMinFare),
        estimated_max_fare: toSafeNumber(fare.estimatedMaxFare)
    };
};

const serializeRideForOffer = (ride) => ({
    id: ride.id,
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
    estimated_fare: serializeRideFareForOffer(ride.fare),
    rider_note_to_driver: ride.riderNoteToDriver || null
});

const serializeRideOffer = (offer) => ({
    id: offer.id,
    ride_id: offer.rideId,
    driver_id: offer.driverId,
    status: offer.status,
    distance_to_pickup_km: toSafeNumber(offer.distanceToPickupKm),
    driver_rating_at_offer: toSafeNumber(offer.driverRatingAtOffer),
    decline_reason: offer.declineReason,
    offered_at: offer.offeredAt,
    responded_at: offer.respondedAt,
    expires_at: offer.expiresAt,
    ride: serializeRideForOffer(offer.ride)
});

const serializeAcceptedRide = (ride) => ({
    id: ride.id,
    rider_id: ride.riderId,
    driver_id: ride.driverId,
    vehicle_id: ride.vehicleId,
    status: ride.status,
    accepted_at: ride.acceptedAt,
    pickup: {
        latitude: Number(ride.pickupLatitude),
        longitude: Number(ride.pickupLongitude),
        address: ride.pickupAddress || null
    },
    dropoff: {
        latitude: Number(ride.dropoffLatitude),
        longitude: Number(ride.dropoffLongitude),
        address: ride.dropoffAddress || null
    }
});

const getDriverByUserId = async (client, userId) => {
    return client.driver.findUnique({
        where: {
            userId
        },
        include: {
            vehicles: {
                where: {
                    isActive: true,
                    verificationStatus: "approved"
                },
                take: 1
            }
        }
    });
};

const getDriverCurrentLocation = async (driverId) => {
    if (mongoose.connection.readyState !== 1) return null;

    const locationDoc = await DriverLocation.findOne({
        driver_id: driverId,
        is_available: true
    }).lean();

    const coordinates = locationDoc?.location?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
};

const buildDriverToPickupFallbackRoute = (origin, pickup, vehicleType = "car") => {
    const distanceKm = origin ? haversineDistanceKm(origin.latitude, origin.longitude, pickup.latitude, pickup.longitude) : 0;

    const averageSpeedByVehicle = {
        bike: 22,
        rickshaw: 18,
        car: 28
    };

    const speed = averageSpeedByVehicle[String(vehicleType).toLowerCase()] || 28;
    const normalDurationMin = origin ? Math.max(1, Math.round((distanceKm / speed) * 60)) : 0;
    const trafficDelayMin = origin ? Math.max(1, Math.round(normalDurationMin * 0.25)) : 0;
    const trafficDurationMin = normalDurationMin + trafficDelayMin;

    return {
        route_id: `route_driver_to_pickup_${crypto.randomUUID()}`,
        ride_id: null,
        route_type: "driver_to_pickup",
        provider: "mock",
        selected: true,
        distance_km: Number(distanceKm.toFixed(2)),
        normal_duration_min: normalDurationMin,
        traffic_duration_min: trafficDurationMin,
        traffic_delay_min: trafficDelayMin,
        polyline: "",
        steps: []
    };
};

const buildDriverToPickupRoute = async ({ driverId, pickup, vehicleType = "car" }) => {
    const origin = await getDriverCurrentLocation(driverId);

    const liveRoute =
        origin && (await getGoogleRouteDirections(origin, pickup, [], vehicleType));

    const route = liveRoute || buildDriverToPickupFallbackRoute(origin, pickup, vehicleType);

    return {
        route_id: `route_driver_to_pickup_${crypto.randomUUID()}`,
        ride_id: null,
        route_type: "driver_to_pickup",
        provider: route.provider || "mock",
        selected: true,
        distance_km: toSafeNumber(route.distance_km, 0),
        normal_duration_min: Math.round(toSafeNumber(route.normal_duration_min, 0)),
        traffic_duration_min: Math.round(toSafeNumber(route.traffic_duration_min, 0)),
        traffic_delay_min: Math.round(toSafeNumber(route.traffic_delay_min, 0)),
        polyline: route.polyline || "",
        steps: Array.isArray(route.steps) ? route.steps : []
    };
};

const persistDriverToPickupRouteToMongo = async ({ route, rideId, driverId, pickup, vehicleType }) => {
    if (mongoose.connection.readyState !== 1) return null;

    const collection = mongoose.connection.collection(RIDE_OFFER_COLLECTION);

    const document = {
        route_id: route.route_id,
        ride_id: rideId,
        driver_id: driverId,
        route_type: "driver_to_pickup",
        provider: route.provider,
        selected: true,
        distance_km: route.distance_km,
        normal_duration_min: route.normal_duration_min,
        traffic_duration_min: route.traffic_duration_min,
        traffic_delay_min: route.traffic_delay_min,
        polyline: route.polyline,
        steps: route.steps || [],
        pickup,
        vehicle_type: vehicleType,
        created_at: new Date(),
        updated_at: new Date()
    };

    await collection.insertOne(document);
    return document;
};

const markDriverUnavailableInMongo = async (driverId) => {
    if (mongoose.connection.readyState !== 1) return null;

    return DriverLocation.findOneAndUpdate(
        {
            driver_id: driverId
        },
        {
            $set: {
                is_available: false,
                updated_at: new Date()
            }
        },
        {
            new: true
        }
    );
};

const persistDriverAcceptedRideToNeo4j = async ({ driverId, rideId }) => {
    if (!neo4jDriver) return;

    const session = neo4jDriver.session();

    try {
        await session.run(
            `
            MERGE (d:Driver {id: $driverId})
            MERGE (r:Ride {id: $rideId})
            MERGE (d)-[:ACCEPTED]->(r)
            `,
            {
                driverId,
                rideId
            }
        );
    } finally {
        await session.close();
    }
};

const listMyRideOffers = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { status } = req.query;

    if (status !== undefined && status !== null && String(status).trim() !== "") {
        if (!ALLOWED_RIDE_OFFER_STATUSES.has(String(status).trim().toLowerCase())) {
            throw new ApiError(400, "Invalid ride offer status");
        }
    }

    const driver = await getDriverByUserId(prisma, user.id);

    if (!driver) {
        throw new ApiError(404, "Driver profile not found");
    }

    const now = new Date();

    await prisma.rideOffer.updateMany({
        where: {
            driverId: driver.id,
            status: "sent",
            expiresAt: {
                lt: now
            }
        },
        data: {
            status: "expired"
        }
    });

    const rideOffers = await prisma.rideOffer.findMany({
        where: {
            driverId: driver.id,
            ...(status ? { status: String(status).trim().toLowerCase() } : {})
        },
        orderBy: {
            offeredAt: "desc"
        },
        include: {
            ride: {
                include: {
                    fare: true
                }
            }
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            rideOffers.map(serializeRideOffer),
            "Ride offers fetched successfully"
        )
    );
});

const acceptRideOffer = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { offer_id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
        const driver = await getDriverByUserId(tx, user.id);

        if (!driver) {
            throw new ApiError(404, "Driver profile not found");
        }

        if (!driver.isAvailable) {
            throw new ApiError(409, "Driver is not available");
        }

        const activeVehicle = driver.vehicles?.[0] || null;

        if (!activeVehicle) {
            throw new ApiError(400, "Driver must have an active approved vehicle");
        }

        const offer = await tx.rideOffer.findFirst({
            where: {
                id: offer_id,
                driverId: driver.id
            },
            include: {
                ride: true
            }
        });

        if (!offer) {
            throw new ApiError(404, "Ride offer not found");
        }

        const now = new Date();

        if (offer.status === "expired" || (offer.expiresAt && offer.expiresAt < now)) {
            if (offer.status !== "expired") {
                await tx.rideOffer.update({
                    where: { id: offer.id },
                    data: {
                        status: "expired"
                    }
                });
            }
            throw new ApiError(410, "Ride offer has expired");
        }

        if (offer.status !== "sent") {
            throw new ApiError(409, "Ride offer cannot be accepted in its current state");
        }

        if (offer.ride.status !== "searching_driver" && offer.ride.status !== "requested") {
            throw new ApiError(409, "Ride is no longer available for acceptance");
        }

        const updatedDriver = await tx.driver.update({
            where: { id: driver.id },
            data: {
                isAvailable: false
            }
        });

        const updatedOffer = await tx.rideOffer.update({
            where: { id: offer.id },
            data: {
                status: "accepted",
                respondedAt: now
            }
        });

        const updatedRide = await tx.ride.update({
            where: { id: offer.rideId },
            data: {
                driverId: driver.id,
                vehicleId: activeVehicle.id,
                status: "accepted",
                acceptedAt: now
            }
        });

        await tx.rideStatusHistory.create({
            data: {
                rideId: offer.rideId,
                oldStatus: offer.ride.status,
                newStatus: "accepted",
                changedByUserId: user.id
            }
        });

        await tx.rideOffer.updateMany({
            where: {
                rideId: offer.rideId,
                status: "sent",
                id: {
                    not: offer.id
                }
            },
            data: {
                status: "expired",
                respondedAt: now
            }
        });

        return {
            driver: updatedDriver,
            offer: updatedOffer,
            ride: updatedRide,
            activeVehicle
        };
    });

    const pickup = {
        latitude: Number(result.ride.pickupLatitude),
        longitude: Number(result.ride.pickupLongitude),
        address: result.ride.pickupAddress || null
    };

    const driverToPickupRoute = await buildDriverToPickupRoute({
        driverId: result.driver.id,
        pickup,
        vehicleType: result.activeVehicle.vehicleType
    });

    await Promise.allSettled([
        markDriverUnavailableInMongo(result.driver.id),
        persistDriverToPickupRouteToMongo({
            route: driverToPickupRoute,
            rideId: result.ride.id,
            driverId: result.driver.id,
            pickup,
            vehicleType: result.activeVehicle.vehicleType
        }),
        persistDriverAcceptedRideToNeo4j({
            driverId: result.driver.id,
            rideId: result.ride.id
        })
    ]).then((results) => {
        results.forEach((r) => {
            if (r.status === "rejected") {
                logger.warn(`Driver ride-offer side effect failed: ${r.reason?.message || r.reason}`);
            }
        });
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                offer: {
                    id: result.offer.id,
                    ride_id: result.offer.rideId,
                    driver_id: result.offer.driverId,
                    status: result.offer.status,
                    responded_at: result.offer.respondedAt
                },
                ride: serializeAcceptedRide(result.ride),
                driver_to_pickup_route: driverToPickupRoute
            },
            "Ride offer accepted successfully"
        )
    );
});

const declineRideOffer = asyncHandler(async (req, res) => {
    const user = req.user;

    if (user.role !== "driver") {
        throw new ApiError(403, "Only drivers can access this resource");
    }

    const { offer_id } = req.params;
    const { decline_reason = null } = req.body || {};

    if (decline_reason !== null && decline_reason !== undefined && typeof decline_reason !== "string") {
        throw new ApiError(400, "decline_reason must be a string");
    }

    const normalizedDeclineReason =
        typeof decline_reason === "string" && decline_reason.trim() ? decline_reason.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
        const driver = await getDriverByUserId(tx, user.id);

        if (!driver) {
            throw new ApiError(404, "Driver profile not found");
        }

        const offer = await tx.rideOffer.findFirst({
            where: {
                id: offer_id,
                driverId: driver.id
            },
            include: {
                ride: true
            }
        });

        if (!offer) {
            throw new ApiError(404, "Ride offer not found");
        }

        const now = new Date();

        if (offer.status === "expired" || (offer.expiresAt && offer.expiresAt < now)) {
            if (offer.status !== "expired") {
                await tx.rideOffer.update({
                    where: { id: offer.id },
                    data: { status: "expired" }
                });
            }
            throw new ApiError(410, "Ride offer has expired");
        }

        if (offer.status !== "sent") {
            throw new ApiError(409, "Ride offer cannot be declined in its current state");
        }

        const updatedOffer = await tx.rideOffer.update({
            where: {
                id: offer.id
            },
            data: {
                status: "declined",
                declineReason: normalizedDeclineReason,
                respondedAt: now
            }
        });

        return {
            offer: updatedOffer
        };
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                offer: {
                    id: result.offer.id,
                    ride_id: result.offer.rideId,
                    driver_id: result.offer.driverId,
                    status: result.offer.status,
                    decline_reason: result.offer.declineReason,
                    responded_at: result.offer.respondedAt
                }
            },
            "Ride offer declined successfully"
        )
    );
});

export {
    getCurrentDriverProfile,
    updateDriverAvailability,
    updateDriverLocation,
    getDriverDocuments,
    uploadDriverDocument,
    getMyVehicles,
    createVehicle,
    updateVehicle,
    setActiveVehicle,
    listMyRideOffers,
    acceptRideOffer,
    declineRideOffer
};