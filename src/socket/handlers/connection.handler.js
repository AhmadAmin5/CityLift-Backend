import logger from "../../utils/logger.js";
import DriverLocation from "../../models/driverLocation.model.js";

/**
 * Handles basic socket connections, room joining based on user roles, and disconnections.
 */
export const registerConnectionHandler = (io, socket) => {
    const user = socket.user;

    // Join user-specific room
    socket.join(`user:${user.id}`);
    logger.debug(`Socket ${socket.id} joined room user:${user.id}`);

    // Join rider-specific room if they have a rider profile
    if (user.riderProfile) {
        socket.join(`rider:${user.riderProfile.id}`);
        logger.debug(`Socket ${socket.id} joined room rider:${user.riderProfile.id}`);
    }

    // Join driver-specific room if they have a driver profile
    if (user.driverProfile) {
        socket.join(`driver:${user.driverProfile.id}`);
        logger.debug(`Socket ${socket.id} joined room driver:${user.driverProfile.id}`);
    }

    socket.on("disconnect", async () => {
        logger.debug(`Socket disconnected: ${socket.id}`);
        
        // If a driver disconnects, mark them as unavailable in driver locations (optional but good practice)
        if (user.driverProfile) {
            try {
                await DriverLocation.findOneAndUpdate(
                    { driver_id: user.driverProfile.id },
                    { is_available: false, updated_at: new Date() }
                );
            } catch (error) {
                logger.error(`Error updating driver location on disconnect: ${error.message}`);
            }
        }
    });
};
