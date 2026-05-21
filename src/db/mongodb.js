import mongoose from "mongoose";
import logger from "../utils/logger.js";

import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectMongoDB = async () => {
    try {
        logger.info("Connecting MongoDB...");
        const connectionInstance = await mongoose.connect(
            `${process.env.MONGODB_URI}/${process.env.MONGODB_NAME}`
        );
        if (connectionInstance) {
            logger.success("MongoDB connected");
            // logger.info("Host: " + connectionInstance.connection.host)
        }
    } catch (error) {
        logger.error("Failed to connect MongoDB");
        throw error;
    }
};

export default connectMongoDB;
