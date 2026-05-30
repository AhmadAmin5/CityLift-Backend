import jwt from "jsonwebtoken";
import { prisma } from "../../db/postgres.js";

/**
 * Socket.IO middleware to authenticate connection via JWT token.
 * Validates the token and attaches the user (with rider/driver profiles) to the socket object.
 */
export const socketAuthMiddleware = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }

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
            return next(new Error("Authentication error: Invalid access token"));
        }

        socket.user = user;
        next();
    } catch (error) {
        return next(new Error("Authentication error: Invalid token or token malfunctioned"));
    }
};
