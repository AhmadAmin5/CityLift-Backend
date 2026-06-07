import logger from "../../utils/logger.js";
import { prisma } from "../../db/postgres.js";
import mongoose from "mongoose";
import { getCurrentWeather } from "../../services/openWeather.service.js";
import DriverLocation from "../../models/driverLocation.model.js";
import WeatherUpdate from "../../models/weatherUpdate.model.js";

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
                speed_kmph = 0,
                heading = 0,
                traffic_level = "unknown",
                eta_min,
                distance_remaining_km
            } = payload;

            if (!ride_id || latitude === undefined || longitude === undefined) return;

            // Optional: Check if the user is actually the driver of this ride
            const ride = await prisma.ride.findUnique({
                where: { id: ride_id }
            });

            if (!ride) return;

            const driverId = ride.driverId;
            const timestamp = new Date();

            // Fetch or reuse cached weather data for the ride
            let weather;
            try {
                const oneMinuteAgo = new Date(Date.now() - 60000);
                const lastWeather = await WeatherUpdate.findOne({ ride_id }).sort({ timestamp: -1 }).lean();

                if (lastWeather && lastWeather.timestamp > oneMinuteAgo) {
                    weather = {
                        weather_code: lastWeather.weather_code,
                        rain_mm: lastWeather.rain_mm,
                        visibility_m: lastWeather.visibility_m,
                        wind_speed: lastWeather.wind_speed,
                        feels_like_temp: lastWeather.feels_like_temp
                    };
                } else {
                    weather = await getCurrentWeather({ latitude, longitude });
                    await WeatherUpdate.create({
                        ride_id,
                        latitude: Number(latitude),
                        longitude: Number(longitude),
                        ...weather,
                        timestamp
                    });
                }
            } catch (weatherErr) {
                logger.error(`Error processing weather in socket tracking: ${weatherErr.message}`);
                weather = {
                    weather_code: 0,
                    rain_mm: 0,
                    visibility_m: 10000,
                    wind_speed: 5,
                    feels_like_temp: 30
                };
            }

            // Save to ride_tracking MongoDB collection
            if (mongoose.connection.readyState === 1) {
                const trackingCollection = mongoose.connection.collection("ride_tracking");
                await trackingCollection.insertOne({
                    ride_id: ride.id,
                    driver_id: driverId,
                    location: {
                        type: "Point",
                        coordinates: [Number(longitude), Number(latitude)]
                    },
                    speed_kmph: Number(speed_kmph),
                    heading: Number(heading),
                    traffic_level,
                    weather_code: weather.weather_code,
                    rain_mm: weather.rain_mm,
                    visibility_m: weather.visibility_m,
                    wind_speed: weather.wind_speed,
                    feels_like_temp: weather.feels_like_temp,
                    timestamp
                });

                // Update ride_live_state MongoDB collection
                const liveStateCollection = mongoose.connection.collection("ride_live_state");
                const liveStateUpdate = {
                    ride_id: ride.id,
                    rider_id: ride.riderId,
                    driver_id: driverId,
                    status: ride.status,
                    current_location: {
                        type: "Point",
                        coordinates: [Number(longitude), Number(latitude)]
                    },
                    current_route_id: ride.selectedRouteId,
                    eta_min: eta_min !== undefined ? Math.round(Number(eta_min)) : null,
                    distance_remaining_km:
                        distance_remaining_km !== undefined
                            ? Number(Number(distance_remaining_km).toFixed(2))
                            : null,
                    updated_at: timestamp
                };
                await liveStateCollection.updateOne(
                    { ride_id: ride.id },
                    { $set: liveStateUpdate },
                    { upsert: true }
                );

                // Update DriverLocation
                if (driverId) {
                    await DriverLocation.updateOne(
                        { driver_id: driverId },
                        {
                            $set: {
                                location: {
                                    type: "Point",
                                    coordinates: [Number(longitude), Number(latitude)]
                                },
                                heading: Number(heading),
                                speed_kmph: Number(speed_kmph),
                                updated_at: timestamp
                            }
                        },
                        { upsert: true }
                    );
                }
            }

            // 18.11 Server Event: Ride Live Update
            // Broadcast the full live state to the ride room
            const liveStatePayload = {
                live_state: {
                    ride_id: ride.id,
                    rider_id: ride.riderId,
                    driver_id: ride.driverId,
                    status: ride.status,
                    current_location: {
                        latitude: Number(latitude),
                        longitude: Number(longitude)
                    },
                    current_route_id: ride.selectedRouteId,
                    eta_min: eta_min !== undefined ? Math.round(Number(eta_min)) : null,
                    distance_remaining_km:
                        distance_remaining_km !== undefined
                            ? Number(Number(distance_remaining_km).toFixed(2))
                            : null,
                    updated_at: timestamp.toISOString()
                }
            };

            io.to(`ride:${ride_id}`).emit("ride:live:update", liveStatePayload);
        } catch (error) {
            logger.error(`Error in ride:tracking:update: ${error.message}`);
        }
    });
};
