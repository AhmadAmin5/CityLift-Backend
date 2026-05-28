import { prisma } from "../db/postgres.js";

import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const uploadProfilePhoto = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, "Profile picture is required");
    }

    const currentUser = await prisma.user.findUnique({
        where: {
            id: req.user.id
        }
    });

    if (!currentUser) {
        throw new ApiError(404, "User not found");
    }

    let cloudinaryResponse;

    try {
        cloudinaryResponse = await uploadToCloudinary(req.file.buffer, "profilePictures");
    } catch (error) {
        console.error("Cloudinary Upload Error:", error);

        throw new ApiError(500, "Failed to upload profile picture");
    }

    if (!cloudinaryResponse?.secure_url) {
        throw new ApiError(500, "Cloudinary did not return image URL");
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            profilePhotoUrl: cloudinaryResponse.secure_url
        }
    });

    return res.status(200).json({
        success: true,
        message: "Profile picture uploaded successfully",
        data: {
            profile_photo_url: updatedUser.profilePhotoUrl,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                role: updatedUser.role,
                profile_photo_url: updatedUser.profilePhotoUrl,
                email_verified_at: updatedUser.emailVerifiedAt,
                phone_verified_at: updatedUser.phoneVerifiedAt,
                created_at: updatedUser.createdAt,
                updated_at: updatedUser.updatedAt
            }
        },
        meta: null
    });
});

const updateCurrentUserProfile = asyncHandler(async (req, res) => {
    const currentUser = await prisma.user.findUnique({
        where: {
            id: req.user.id
        }
    });

    if (!currentUser) {
        throw new ApiError(404, "User not found");
    }

    const { name, email, phone } = req.body;

    if (!name && !email && !phone) {
        throw new ApiError(400, "At least one field is required");
    }

    const updateData = {};

    if (name) {
        updateData.name = name;
    }

    if (email && email !== currentUser.email) {
        const existingEmailUser = await prisma.user.findFirst({
            where: {
                email,
                NOT: {
                    id: currentUser.id
                }
            }
        });

        if (existingEmailUser) {
            throw new ApiError(409, "Email is already in use");
        }

        updateData.email = email;

        // Reset verification if email changes
        updateData.emailVerifiedAt = null;
    }

    // Update phone
    if (phone && phone !== currentUser.phone) {
        // Check phone uniqueness
        const existingPhoneUser = await prisma.user.findFirst({
            where: {
                phone,
                NOT: {
                    id: currentUser.id
                }
            }
        });

        if (existingPhoneUser) {
            throw new ApiError(409, "Phone number is already in use");
        }

        updateData.phone = phone;

        // Reset verification if phone changes
        updateData.phoneVerifiedAt = null;
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: currentUser.id
        },
        data: updateData
    });

    return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                role: updatedUser.role,
                profile_photo_url: updatedUser.profilePhotoUrl,
                email_verified_at: updatedUser.emailVerifiedAt,
                phone_verified_at: updatedUser.phoneVerifiedAt,
                created_at: updatedUser.createdAt,
                updated_at: updatedUser.updatedAt
            }
        },
        meta: null
    });
});

export { uploadProfilePhoto, updateCurrentUserProfile };
