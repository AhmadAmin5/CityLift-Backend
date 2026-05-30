import { Server } from "socket.io";
import logger from "../utils/logger.js";
import { socketAuthMiddleware } from "./middlewares/socketAuth.middleware.js";
import { registerConnectionHandler } from "./handlers/connection.handler.js";
import { registerRideHandler } from "./handlers/ride.handler.js";
import { registerDriverHandler } from "./handlers/driver.handler.js";

let io = null;

/**
 * Initialize Socket.IO on the given HTTP server.
 * Creates the `/realtime` namespace with JWT auth and all event handlers.
 */
const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            credentials: true
        }
    });

    const realtimeNamespace = io.of("/realtime");

    // Authenticate every socket connection via JWT
    realtimeNamespace.use(socketAuthMiddleware);

    realtimeNamespace.on("connection", (socket) => {
        registerConnectionHandler(realtimeNamespace, socket);
        registerRideHandler(realtimeNamespace, socket);
        registerDriverHandler(realtimeNamespace, socket);
    });

    logger.success("Socket.IO initialized on /realtime namespace");

    return io;
};

/**
 * Get the Socket.IO server instance.
 * Returns null if not yet initialized (REST-only mode).
 */
const getIO = () => io;

export { initializeSocket, getIO };
