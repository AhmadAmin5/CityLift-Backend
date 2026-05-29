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

export {
    getCurrentDriverProfile,
    updateDriverAvailability,
    updateDriverLocation,
    getDriverDocuments,
    uploadDriverDocument,
    getMyVehicles,
    createVehicle,
    updateVehicle,
    setActiveVehicle
};
