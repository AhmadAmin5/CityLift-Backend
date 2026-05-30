import logger from "../../utils/logger.js";
import { prisma } from "../../db/postgres.js";

/**
 * Handles ride-related socket events.
 */
export const registerRideHandler = (io, socket) => {
    // 18.3 Client Event: Join Ride Room
    socket.on("ride:join", async (payload, callback) => {
        try {
            const { ride_id } = payload;
            
            if (!ride_id) {
                if (typeof callback === "function") {
                    callback({ success: false, message: "ride_id is required" });
                }
                return;
            }

            socket.join(`ride:${ride_id}`);
            logger.debug(`Socket ${socket.id} joined ride room: ride:${ride_id}`);

            if (typeof callback === "function") {
                callback({
                    success: true,
                    message: "Joined ride room",
                    data: {
                        ride_id
                    }
                });
            }
        } catch (error) {
            logger.error(`Error in ride:join: ${error.message}`);
            if (typeof callback === "function") {
                callback({ success: false, message: "Internal server error" });
            }
        }
    });

    // 18.4 Client Event: Leave Ride Room
    socket.on("ride:leave", async (payload, callback) => {
        try {
            const { ride_id } = payload;
            if (ride_id) {
                socket.leave(`ride:${ride_id}`);
                logger.debug(`Socket ${socket.id} left ride room: ride:${ride_id}`);
            }
            if (typeof callback === "function") {
                callback({ success: true, message: "Left ride room" });
            }
        } catch (error) {
            logger.error(`Error in ride:leave: ${error.message}`);
        }
    });

    // 18.10 Client Event: Ride Tracking Update
    socket.on("ride:tracking:update", async (payload) => {
        try {
            const {
                ride_id,
                latitude,
                longitude,
                speed_kmph,
                heading,
                traffic_level,
                eta_min,
                distance_remaining_km
            } = payload;

            if (!ride_id || !latitude || !longitude) return;

            // Optional: Check if the user is actually the driver of this ride
            const ride = await prisma.ride.findUnique({
                where: { id: ride_id }
            });

            if (!ride) return;

            // 18.11 Server Event: Ride Live Update
            // Broadcast the full live state to the ride room
            const liveStatePayload = {
                live_state: {
                    ride_id: ride.id,
                    rider_id: ride.riderId,
                    driver_id: ride.driverId,
                    status: ride.status,
                    current_location: {
                        latitude,
                        longitude
                    },
                    current_route_id: ride.selectedRouteId,
                    eta_min,
                    distance_remaining_km,
                    updated_at: new Date().toISOString()
                }
            };

            io.to(`ride:${ride_id}`).emit("ride:live:update", liveStatePayload);
        } catch (error) {
            logger.error(`Error in ride:tracking:update: ${error.message}`);
        }
    });
};
