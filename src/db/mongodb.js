import mongoose from "mongoose";
import logger from "../utils/logger.js";

const connectMongoDB = async () => {
    try {
        logger.info("Connecting Database...");
        const connectionInstance = await mongoose.connect(
            `${process.env.MONGODB_URI}/${process.env.DB_NAME}`
        );
        if (connectionInstance) {
            logger.success("Database connected");
            // logger.info("Host: " + connectionInstance.connection.host)
        }
    } catch (error) {
        logger.error("Failed to connect database");
        throw error;
    }
};

export default connectMongoDB;
