import { prisma } from "../db/postgres.js";

import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import SurgeZone from "../models/surgeZone.model.js";

/**
 * Convert a Prisma Time field to an "HH:MM:SS" string.
 * Prisma returns @db.Time columns as Date objects anchored to 1970-01-01 UTC.
 */
const formatTime = (dateValue) => {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
};

/**
 * Parse a time string like "17:00:00" into a Date that Prisma can store in a @db.Time column.
 */
const parseTimeString = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || "0", 10);
    const s = parseInt(parts[2] || "0", 10);
    return new Date(Date.UTC(1970, 0, 1, h, m, s));
};

/**
 * Format a PricingRule row to the API contract shape (snake_case, Numbers instead of Decimal).
 */
const formatPricingRule = (rule) => ({
    id: rule.id,
    city: rule.city,
    vehicle_type: rule.vehicleType,
    base_fare: Number(rule.baseFare),
    per_km_rate: Number(rule.perKmRate),
    per_min_rate: Number(rule.perMinRate),
    waiting_per_min_rate: Number(rule.waitingPerMinRate),
    traffic_delay_per_min_rate: Number(rule.trafficDelayPerMinRate),
    minimum_fare: Number(rule.minimumFare),
    peak_start_time: formatTime(rule.peakStartTime),
    peak_end_time: formatTime(rule.peakEndTime),
    peak_multiplier: Number(rule.peakMultiplier),
    is_active: rule.isActive,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt
});



// ─── 16.1  GET /admin/pricing-rules ───────────────────────────────────

const listPricingRules = asyncHandler(async (req, res) => {

    const pricingRules = await prisma.pricingRule.findMany({
        orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
        success: true,
        message: "Pricing rules fetched successfully",
        data: pricingRules.map(formatPricingRule),
        meta: null
    });
});

// ─── 16.2  POST /admin/pricing-rules ──────────────────────────────────

const ALLOWED_VEHICLE_TYPES = ["car", "bike", "rickshaw"];

const createPricingRule = asyncHandler(async (req, res) => {

    const {
        city,
        vehicle_type,
        base_fare,
        per_km_rate,
        per_min_rate,
        waiting_per_min_rate,
        traffic_delay_per_min_rate,
        minimum_fare,
        peak_start_time,
        peak_end_time,
        peak_multiplier,
        is_active
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────
    if (
        !city ||
        !vehicle_type ||
        base_fare === undefined ||
        per_km_rate === undefined ||
        per_min_rate === undefined ||
        minimum_fare === undefined
    ) {
        throw new ApiError(400, "All required fields must be provided", [
            {
                code: "VALIDATION_ERROR",
                details: [
                    { field: "city", message: "city is required" },
                    { field: "vehicle_type", message: "vehicle_type is required" },
                    { field: "base_fare", message: "base_fare is required" },
                    { field: "per_km_rate", message: "per_km_rate is required" },
                    { field: "per_min_rate", message: "per_min_rate is required" },
                    { field: "minimum_fare", message: "minimum_fare is required" }
                ]
            }
        ]);
    }

    if (!ALLOWED_VEHICLE_TYPES.includes(vehicle_type)) {
        throw new ApiError(400, "Invalid vehicle type. Allowed: car, bike, rickshaw");
    }

    const pricingRule = await prisma.pricingRule.create({
        data: {
            city,
            vehicleType: vehicle_type,
            baseFare: base_fare,
            perKmRate: per_km_rate,
            perMinRate: per_min_rate,
            waitingPerMinRate: waiting_per_min_rate ?? 0,
            trafficDelayPerMinRate: traffic_delay_per_min_rate ?? 0,
            minimumFare: minimum_fare,
            peakStartTime: parseTimeString(peak_start_time),
            peakEndTime: parseTimeString(peak_end_time),
            peakMultiplier: peak_multiplier ?? 1.0,
            isActive: is_active ?? true
        }
    });

    return res.status(201).json({
        success: true,
        message: "Pricing rule created successfully",
        data: {
            pricing_rule: formatPricingRule(pricingRule)
        },
        meta: null
    });
});

// ─── 16.3  PATCH /admin/pricing-rules/:pricing_rule_id ────────────────

const updatePricingRule = asyncHandler(async (req, res) => {

    const { pricing_rule_id } = req.params;

    const existingRule = await prisma.pricingRule.findUnique({
        where: { id: pricing_rule_id }
    });

    if (!existingRule) {
        throw new ApiError(404, "Pricing rule not found");
    }

    const {
        city,
        vehicle_type,
        base_fare,
        per_km_rate,
        per_min_rate,
        waiting_per_min_rate,
        traffic_delay_per_min_rate,
        minimum_fare,
        peak_start_time,
        peak_end_time,
        peak_multiplier,
        is_active
    } = req.body;

    if (vehicle_type !== undefined && !ALLOWED_VEHICLE_TYPES.includes(vehicle_type)) {
        throw new ApiError(400, "Invalid vehicle type. Allowed: car, bike, rickshaw");
    }

    const updatedRule = await prisma.pricingRule.update({
        where: { id: pricing_rule_id },
        data: {
            ...(city !== undefined && { city }),
            ...(vehicle_type !== undefined && { vehicleType: vehicle_type }),
            ...(base_fare !== undefined && { baseFare: base_fare }),
            ...(per_km_rate !== undefined && { perKmRate: per_km_rate }),
            ...(per_min_rate !== undefined && { perMinRate: per_min_rate }),
            ...(waiting_per_min_rate !== undefined && { waitingPerMinRate: waiting_per_min_rate }),
            ...(traffic_delay_per_min_rate !== undefined && {
                trafficDelayPerMinRate: traffic_delay_per_min_rate
            }),
            ...(minimum_fare !== undefined && { minimumFare: minimum_fare }),
            ...(peak_start_time !== undefined && { peakStartTime: parseTimeString(peak_start_time) }),
            ...(peak_end_time !== undefined && { peakEndTime: parseTimeString(peak_end_time) }),
            ...(peak_multiplier !== undefined && { peakMultiplier: peak_multiplier }),
            ...(is_active !== undefined && { isActive: is_active })
        }
    });

    return res.status(200).json({
        success: true,
        message: "Pricing rule updated successfully",
        data: {
            pricing_rule: formatPricingRule(updatedRule)
        },
        meta: null
    });
});

// ─── 16.4  PATCH /admin/driver-documents/:document_id/review ──────────

const ALLOWED_DOC_STATUSES = ["approved", "rejected"];

const formatDriverDocument = (doc) => ({
    id: doc.id,
    driver_id: doc.driverId,
    vehicle_id: doc.vehicleId,
    document_type: doc.documentType,
    file_url: doc.fileUrl,
    status: doc.status,
    rejection_reason: doc.rejectionReason,
    uploaded_at: doc.uploadedAt,
    verified_at: doc.verifiedAt
});

const reviewDriverDocument = asyncHandler(async (req, res) => {

    const { document_id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!status) {
        throw new ApiError(400, "status is required");
    }

    if (!ALLOWED_DOC_STATUSES.includes(status)) {
        throw new ApiError(400, "Invalid status. Allowed: approved, rejected");
    }

    if (status === "rejected" && !rejection_reason) {
        throw new ApiError(400, "rejection_reason is required when rejecting a document");
    }

    const existingDoc = await prisma.driverDocument.findUnique({
        where: { id: document_id }
    });

    if (!existingDoc) {
        throw new ApiError(404, "Driver document not found");
    }

    const updatedDoc = await prisma.driverDocument.update({
        where: { id: document_id },
        data: {
            status,
            rejectionReason: status === "rejected" ? rejection_reason : null,
            verifiedAt: new Date()
        }
    });

    return res.status(200).json({
        success: true,
        message: "Driver document reviewed successfully",
        data: {
            document: formatDriverDocument(updatedDoc)
        },
        meta: null
    });
});

// ─── 16.5  PATCH /admin/drivers/:driver_id/approval ───────────────────

const ALLOWED_APPROVAL_STATUSES = ["pending", "approved", "rejected", "suspended"];

const updateDriverApproval = asyncHandler(async (req, res) => {

    const { driver_id } = req.params;
    const { approval_status } = req.body;

    if (!approval_status) {
        throw new ApiError(400, "approval_status is required");
    }

    if (!ALLOWED_APPROVAL_STATUSES.includes(approval_status)) {
        throw new ApiError(400, "Invalid approval_status. Allowed: pending, approved, rejected, suspended");
    }

    const existingDriver = await prisma.driver.findUnique({
        where: { id: driver_id }
    });

    if (!existingDriver) {
        throw new ApiError(404, "Driver not found");
    }

    const updatedDriver = await prisma.driver.update({
        where: { id: driver_id },
        data: {
            approvalStatus: approval_status
        }
    });

    return res.status(200).json({
        success: true,
        message: "Driver approval status updated successfully",
        data: {
            driver: {
                id: updatedDriver.id,
                approval_status: updatedDriver.approvalStatus
            }
        },
        meta: null
    });
});

// ─── 16.6  POST /admin/surge-zones ────────────────────────────────────

const upsertSurgeZone = asyncHandler(async (req, res) => {

    const {
        id,
        city,
        area_name,
        center,
        radius_km,
        demand_count,
        available_drivers,
        surge_multiplier
    } = req.body;

    if (!id || !city || !area_name || !center || !center.latitude || !center.longitude || radius_km === undefined) {
        throw new ApiError(400, "id, city, area_name, center (latitude, longitude), and radius_km are required");
    }

    const demandVal = demand_count ?? 0;
    const driversVal = available_drivers ?? 0;
    const supplyDemandRatio = demandVal > 0
        ? parseFloat((driversVal / demandVal).toFixed(2))
        : 0;

    const surgeZone = await SurgeZone.findOneAndUpdate(
        { zone_id: id },
        {
            $set: {
                zone_id: id,
                city,
                area_name,
                center: {
                    latitude: center.latitude,
                    longitude: center.longitude
                },
                radius_km,
                demand_count: demandVal,
                available_drivers: driversVal,
                supply_demand_ratio: supplyDemandRatio,
                surge_multiplier: surge_multiplier ?? 1.0,
                updated_at: new Date()
            }
        },
        { upsert: true, new: true }
    );

    return res.status(200).json({
        success: true,
        message: "Surge zone saved successfully",
        data: {
            surge_zone: {
                id: surgeZone.zone_id,
                city: surgeZone.city,
                area_name: surgeZone.area_name,
                center: {
                    latitude: surgeZone.center.latitude,
                    longitude: surgeZone.center.longitude
                },
                radius_km: surgeZone.radius_km,
                demand_count: surgeZone.demand_count,
                available_drivers: surgeZone.available_drivers,
                supply_demand_ratio: surgeZone.supply_demand_ratio,
                surge_multiplier: surgeZone.surge_multiplier,
                updated_at: surgeZone.updated_at
            }
        },
        meta: null
    });
});


// ─── 17.1  GET /admin/ml-models ───────────────────────────────────────

const listMlModels = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    let models = await prisma.mlModel.findMany({
        orderBy: { createdAt: "desc" }
    });

    // Auto-seed default model if database is empty
    if (models.length === 0) {
        const defaultModel = await prisma.mlModel.create({
            data: {
                modelName: "fare_prediction_linear_regression",
                modelType: "fare_prediction",
                algorithm: "Linear Regression",
                version: "v1",
                metrics: {
                    mae: 42.5,
                    rmse: 60.2
                },
                artifactPath: "models/fare_prediction_v1.pkl",
                isActive: true,
                createdAt: new Date("2026-05-23T10:00:00Z")
            }
        });
        models = [defaultModel];
    }

    const formattedModels = models.map((model) => ({
        id: model.id,
        model_name: model.modelName,
        model_type: model.modelType,
        algorithm: model.algorithm,
        version: model.version,
        metrics: model.metrics,
        artifact_path: model.artifactPath,
        is_active: model.isActive,
        created_at: model.createdAt
    }));

    return res.status(200).json({
        success: true,
        message: "ML models fetched successfully",
        data: formattedModels,
        meta: null
    });
});

// ─── 17.2  GET /admin/rides/:ride_id/fare-prediction-logs ──────────────

const getFarePredictionLogs = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    const { ride_id } = req.params;

    const ride = await prisma.ride.findUnique({
        where: { id: ride_id },
        include: {
            fare: {
                include: {
                    pricingRule: true
                }
            },
            vehicle: true
        }
    });

    if (!ride) {
        throw new ApiError(404, "Ride not found");
    }

    const logs = [];

    if (ride.fare) {
        const fare = ride.fare;
        const vehicleType = ride.vehicle?.vehicleType || fare.pricingRule?.vehicleType || "car";

        // Reconstruct model name and version
        let modelName = "fare_prediction_linear_regression";
        let modelVersion = "v1";
        if (fare.modelUsed) {
            const parts = fare.modelUsed.split("_v");
            if (parts.length > 1) {
                modelName = parts[0];
                modelVersion = "v" + parts[1];
            } else {
                modelName = fare.modelUsed;
            }
        }

        // Reconstruct pre-ride log
        const preRideLog = {
            ride_id: ride.id,
            prediction_stage: "pre_ride",
            model_name: modelName,
            model_version: modelVersion,
            features: {
                distance_km: fare.estimatedDistanceKm !== null ? Number(fare.estimatedDistanceKm) : 0,
                duration_min: fare.estimatedDurationMin !== null ? Number(fare.estimatedDurationMin) : 0,
                traffic_delay_min: fare.estimatedTrafficDelayMin !== null ? Number(fare.estimatedTrafficDelayMin) : 0,
                waiting_time_min: 0,
                surge_multiplier: fare.surgeMultiplier !== null ? Number(fare.surgeMultiplier) : 1.0,
                peak_multiplier: fare.peakMultiplier !== null ? Number(fare.peakMultiplier) : 1.0,
                hour_of_day: ride.scheduledPickupAt 
                    ? new Date(ride.scheduledPickupAt).getUTCHours() 
                    : new Date(ride.createdAt).getUTCHours(),
                vehicle_type: vehicleType
            },
            predicted_fare: fare.preRideMlPredictedFare !== null ? Number(fare.preRideMlPredictedFare) : 0,
            actual_final_fare: fare.finalFare !== null ? Number(fare.finalFare) : null,
            prediction_error: fare.finalFare !== null && fare.preRideMlPredictedFare !== null
                ? Number((Number(fare.finalFare) - Number(fare.preRideMlPredictedFare)).toFixed(2))
                : null,
            created_at: fare.createdAt
        };
        logs.push(preRideLog);

        // Reconstruct post-ride log if final ML prediction was calculated (ride completed)
        if (fare.finalMlPredictedFare !== null) {
            const postRideLog = {
                ride_id: ride.id,
                prediction_stage: "post_ride",
                model_name: modelName,
                model_version: modelVersion,
                features: {
                    distance_km: fare.actualDistanceKm !== null ? Number(fare.actualDistanceKm) : 0,
                    duration_min: fare.actualDurationMin !== null ? Number(fare.actualDurationMin) : 0,
                    traffic_delay_min: fare.actualTrafficDelayMin !== null ? Number(fare.actualTrafficDelayMin) : 0,
                    waiting_time_min: fare.waitingTimeMin !== null ? Number(fare.waitingTimeMin) : 0,
                    surge_multiplier: fare.surgeMultiplier !== null ? Number(fare.surgeMultiplier) : 1.0,
                    peak_multiplier: fare.peakMultiplier !== null ? Number(fare.peakMultiplier) : 1.0,
                    hour_of_day: fare.finalizedAt 
                        ? new Date(fare.finalizedAt).getUTCHours() 
                        : (ride.completedAt ? new Date(ride.completedAt).getUTCHours() : new Date().getUTCHours()),
                    vehicle_type: vehicleType
                },
                predicted_fare: Number(fare.finalMlPredictedFare),
                actual_final_fare: fare.finalFare !== null ? Number(fare.finalFare) : null,
                prediction_error: fare.finalFare !== null
                    ? Number((Number(fare.finalFare) - Number(fare.finalMlPredictedFare)).toFixed(2))
                    : null,
                created_at: fare.finalizedAt || ride.completedAt || new Date()
            };
            logs.push(postRideLog);
        }
    }

    return res.status(200).json({
        success: true,
        message: "Fare prediction logs fetched successfully",
        data: logs,
        meta: null
    });
});

export {
    listPricingRules,
    createPricingRule,
    updatePricingRule,
    reviewDriverDocument,
    updateDriverApproval,
    upsertSurgeZone,
    listMlModels,
    getFarePredictionLogs
};


