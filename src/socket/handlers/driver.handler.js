import logger from "../../utils/logger.js";
import DriverLocation from "../../models/driverLocation.model.js";

/**
 * Handles driver-related socket events.
 */
export const registerDriverHandler = (io, socket) => {
    // 18.5 Client Event: Driver Location Update
    socket.on("driver:location:update", async (payload) => {
        try {
            const user = socket.user;
            
            // Only drivers can update location
            if (!user.driverProfile) return;

            const driverId = user.driverProfile.id;
            const { latitude, longitude, heading, speed_kmph, current_area } = payload;

            if (!latitude || !longitude) return;

            // Update location in MongoDB
            await DriverLocation.findOneAndUpdate(
                { driver_id: driverId },
                {
                    location: {
                        type: "Point",
                        coordinates: [longitude, latitude] // GeoJSON format: [lng, lat]
                    },
                    heading,
                    speed_kmph,
                    current_area,
                    updated_at: new Date()
                },
                { new: true } // Return updated doc if needed
            );

            logger.debug(`Driver ${driverId} location updated to ${latitude}, ${longitude}`);

            // Send acknowledgment to the driver
            socket.emit("driver:location:updated", {
                success: true,
                message: "Location updated successfully"
            });

            // Note: Broadcasting nearby_drivers:update to relevant riders 
            // requires querying nearby active riders or broadcasting to a city room.
            // This logic can be integrated with a geospatial matching service.
            // io.to(`city:${current_area}`).emit("nearby_drivers:update", { ... });

        } catch (error) {
            logger.error(`Error in driver:location:update: ${error.message}`);
        }
    });
};
