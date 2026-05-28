import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { prisma } from "../db/postgres.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "7d"
        }
    );
};

const registerRider = asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
        throw new ApiError(400, "All fields are required");
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { phone }]
        }
    });

    if (existingUser) {
        if (existingUser.email === email) {
            throw new ApiError(409, "Email already registered");
        }

        if (existingUser.phone === phone) {
            throw new ApiError(409, "Phone number already registered");
        }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
        data: {
            name,
            email,
            phone,
            passwordHash,
            role: "rider",
            riderProfile: {
                create: {}
            }
        },
        include: {
            riderProfile: true
        }
    });

    const accessToken = generateAccessToken(createdUser);

    return res.status(201).json({
        success: true,
        message: "Rider registered successfully",
        data: {
            access_token: accessToken,
            user: {
                id: createdUser.id,
                name: createdUser.name,
                email: createdUser.email,
                phone: createdUser.phone,
                role: createdUser.role,
                profile_photo_url: createdUser.profilePhotoUrl,
                email_verified_at: createdUser.emailVerifiedAt,
                phone_verified_at: createdUser.phoneVerifiedAt,
                created_at: createdUser.createdAt,
                updated_at: createdUser.updatedAt
            },
            rider: {
                id: createdUser.riderProfile.id,
                user_id: createdUser.riderProfile.userId,
                average_rating: Number(createdUser.riderProfile.averageRating),
                total_rides: createdUser.riderProfile.totalRides
            }
        },
        meta: null
    });
});

const registerDriver = asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
        throw new ApiError(400, "All fields are required");
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { phone }]
        }
    });

    if (existingUser) {
        if (existingUser.email === email) {
            throw new ApiError(409, "Email already registered");
        }

        if (existingUser.phone === phone) {
            throw new ApiError(409, "Phone number already registered");
        }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
        data: {
            name,
            email,
            phone,
            passwordHash,
            role: "driver",
            driverProfile: {
                create: {}
            }
        },
        include: {
            driverProfile: true
        }
    });

    const accessToken = generateAccessToken(createdUser);

    return res.status(201).json({
        success: true,
        message: "Driver registered successfully",
        data: {
            access_token: accessToken,
            user: {
                id: createdUser.id,
                name: createdUser.name,
                email: createdUser.email,
                phone: createdUser.phone,
                role: createdUser.role,
                profile_photo_url: createdUser.profilePhotoUrl,
                email_verified_at: createdUser.emailVerifiedAt,
                phone_verified_at: createdUser.phoneVerifiedAt,
                created_at: createdUser.createdAt,
                updated_at: createdUser.updatedAt
            },
            driver: {
                id: createdUser.driverProfile.id,
                user_id: createdUser.driverProfile.userId,
                average_rating: Number(createdUser.driverProfile.averageRating),
                total_rides: createdUser.driverProfile.totalRides,
                is_available: createdUser.driverProfile.isAvailable,
                approval_status: createdUser.driverProfile.approvalStatus
            }
        },
        meta: null
    });
});

const loginUser = asyncHandler(async (req, res) => {
    const { email_or_phone, password } = req.body;

    if (!email_or_phone || !password) {
        throw new ApiError(400, "Email/Phone and password are required");
    }

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                {
                    email: email_or_phone
                },
                {
                    phone: email_or_phone
                }
            ]
        },
        include: {
            riderProfile: true,
            driverProfile: true
        }
    });

    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    const accessToken = generateAccessToken(user);

    return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        data: {
            access_token: accessToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                profile_photo_url: user.profilePhotoUrl,
                email_verified_at: user.emailVerifiedAt,
                phone_verified_at: user.phoneVerifiedAt,
                created_at: user.createdAt,
                updated_at: user.updatedAt
            },
            rider: user.riderProfile
                ? {
                      id: user.riderProfile.id,
                      user_id: user.riderProfile.userId,
                      average_rating: Number(user.riderProfile.averageRating),
                      total_rides: user.riderProfile.totalRides
                  }
                : null,
            driver: user.driverProfile
                ? {
                      id: user.driverProfile.id,
                      user_id: user.driverProfile.userId,
                      average_rating: Number(user.driverProfile.averageRating),
                      total_rides: user.driverProfile.totalRides,
                      is_available: user.driverProfile.isAvailable,
                      approval_status: user.driverProfile.approvalStatus
                  }
                : null
        },
        meta: null
    });
});

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        },
        include: {
            riderProfile: true,
            driverProfile: true
        }
    });

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    return res.status(200).json({
        success: true,
        message: 'Current user fetched successfully',
        data: {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                profile_photo_url: user.profilePhotoUrl,
                email_verified_at: user.emailVerifiedAt,
                phone_verified_at: user.phoneVerifiedAt,
                created_at: user.createdAt,
                updated_at: user.updatedAt
            },
            rider: user.riderProfile
                ? {
                      id: user.riderProfile.id,
                      user_id: user.riderProfile.userId,
                      average_rating: Number(
                          user.riderProfile.averageRating
                      ),
                      total_rides: user.riderProfile.totalRides
                  }
                : null,
            driver: user.driverProfile
                ? {
                      id: user.driverProfile.id,
                      user_id: user.driverProfile.userId,
                      average_rating: Number(
                          user.driverProfile.averageRating
                      ),
                      total_rides: user.driverProfile.totalRides,
                      is_available: user.driverProfile.isAvailable,
                      approval_status:
                          user.driverProfile.approvalStatus
                  }
                : null
        },
        meta: null
    });
});

const logoutUser = asyncHandler(async (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        data: null,
        meta: null
    });
});

export { registerRider, registerDriver, loginUser, getCurrentUser, logoutUser };
