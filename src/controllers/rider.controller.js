import { prisma } from "../db/postgres.js";

import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const getCurrentRiderProfile = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (req.user.role !== "rider") {
        throw new ApiError(403, "Access denied. Rider account required");
    }

    const rider = await prisma.rider.findUnique({
        where: {
            userId: req.user.id
        },
        include: {
            user: true
        }
    });

    if (!rider) {
        throw new ApiError(404, "Rider profile not found");
    }

    return res.status(200).json({
        success: true,
        message: "Rider profile fetched successfully",
        data: {
            rider: {
                id: rider.id,
                user_id: rider.userId,
                average_rating: Number(rider.averageRating),
                total_rides: rider.totalRides,
                user: {
                    id: rider.user.id,
                    name: rider.user.name,
                    email: rider.user.email,
                    phone: rider.user.phone,
                    role: rider.user.role,
                    profile_photo_url: rider.user.profilePhotoUrl,
                    email_verified_at: rider.user.emailVerifiedAt,
                    phone_verified_at: rider.user.phoneVerifiedAt,
                    created_at: rider.user.createdAt,
                    updated_at: rider.user.updatedAt
                }
            }
        },
        meta: null
    });
});

const getAuthenticatedRider = async (userId) => {
    const rider = await prisma.rider.findUnique({
        where: {
            userId
        }
    });

    if (!rider) {
        throw new ApiError(404, "Rider profile not found");
    }

    return rider;
};

const formatSavedPlace = (savedPlace) => ({
    id: savedPlace.id,
    rider_id: savedPlace.riderId,
    label: savedPlace.label,
    place_type: savedPlace.placeType,
    latitude: Number(savedPlace.latitude),
    longitude: Number(savedPlace.longitude),
    address: savedPlace.address,
    provider: savedPlace.provider,
    provider_place_id: savedPlace.providerPlaceId,
    created_at: savedPlace.createdAt,
    updated_at: savedPlace.updatedAt
});

const listSavedPlaces = asyncHandler(async (req, res) => {
    const rider = await getAuthenticatedRider(req.user.id);

    const savedPlaces = await prisma.savedPlace.findMany({
        where: {
            riderId: rider.id
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    return res.status(200).json({
        success: true,
        message: "Saved places fetched successfully",
        data: savedPlaces.map(formatSavedPlace),
        meta: null
    });
});

const createSavedPlace = asyncHandler(async (req, res) => {
    const rider = await getAuthenticatedRider(req.user.id);

    const { label, place_type, latitude, longitude, address, provider, provider_place_id } = req.body;

    if (!label || !place_type || latitude === undefined || longitude === undefined || !address || !provider) {
        throw new ApiError(400, "All required fields must be provided");
    }

    const allowedTypes = ["home", "work", "favorite"];

    if (!allowedTypes.includes(place_type)) {
        throw new ApiError(400, "Invalid place type");
    }

    if (place_type === "home" || place_type === "work") {
        const existingPlace = await prisma.savedPlace.findFirst({
            where: {
                riderId: rider.id,
                placeType: place_type
            }
        });

        if (existingPlace) {
            throw new ApiError(409, `Only one ${place_type} place is allowed`);
        }
    }

    const savedPlace = await prisma.savedPlace.create({
        data: {
            riderId: rider.id,
            label,
            placeType: place_type,
            latitude,
            longitude,
            address,
            provider,
            providerPlaceId: provider_place_id
        }
    });

    return res.status(201).json({
        success: true,
        message: "Saved place created successfully",
        data: {
            saved_place: formatSavedPlace(savedPlace)
        },
        meta: null
    });
});

const updateSavedPlace = asyncHandler(async (req, res) => {
    const rider = await getAuthenticatedRider(req.user.id);

    const { saved_place_id } = req.params;

    const existingSavedPlace = await prisma.savedPlace.findFirst({
        where: {
            id: saved_place_id,
            riderId: rider.id
        }
    });

    if (!existingSavedPlace) {
        throw new ApiError(404, "Saved place not found");
    }

    const { label, latitude, longitude, address, provider, provider_place_id } = req.body;

    const updatedSavedPlace = await prisma.savedPlace.update({
        where: {
            id: saved_place_id
        },
        data: {
            ...(label !== undefined && { label }),
            ...(latitude !== undefined && { latitude }),
            ...(longitude !== undefined && { longitude }),
            ...(address !== undefined && { address }),
            ...(provider !== undefined && { provider }),
            ...(provider_place_id !== undefined && {
                providerPlaceId: provider_place_id
            })
        }
    });

    return res.status(200).json({
        success: true,
        message: "Saved place updated successfully",
        data: {
            saved_place: formatSavedPlace(updatedSavedPlace)
        },
        meta: null
    });
});

const deleteSavedPlace = asyncHandler(async (req, res) => {
    const rider = await getAuthenticatedRider(req.user.id);

    const { saved_place_id } = req.params;

    const existingSavedPlace = await prisma.savedPlace.findFirst({
        where: {
            id: saved_place_id,
            riderId: rider.id
        }
    });

    if (!existingSavedPlace) {
        throw new ApiError(404, "Saved place not found");
    }

    await prisma.savedPlace.delete({
        where: {
            id: saved_place_id
        }
    });

    return res.status(200).json({
        success: true,
        message: "Saved place deleted successfully",
        data: null,
        meta: null
    });
});

export { getCurrentRiderProfile, listSavedPlaces, createSavedPlace, updateSavedPlace, deleteSavedPlace };
