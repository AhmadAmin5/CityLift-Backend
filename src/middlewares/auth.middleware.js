import jwt from "jsonwebtoken";

import { prisma } from "../db/postgres.js";

import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const verifyJWT = asyncHandler(async (req, _, next) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        const user = await prisma.user.findUnique({
            where: {
                id: decodedToken.id
            },
            include: {
                riderProfile: true,
                driverProfile: true
            }
        });

        if (!user) {
            throw new ApiError(401, "Invalid access token", [{ code: "INVALID_TOKEN" }]);
        }

        req.user = user;

        next();
    } catch (error) {
        throw new ApiError(401, "Invalid access token or token malfunctioned");
    }
});

export default verifyJWT;
