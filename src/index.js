import dotenv from "dotenv/config";
import app from "./app.js";
import connectMongoDB from "./db/mongodb.js";
import connectPostgres from "./db/postgres.js";
import connectNeo4j from "./db/neo4j.js";
import logger from "./utils/logger.js";

const startServer = async () => {
    try {
        await Promise.all([connectMongoDB(), connectPostgres(), connectNeo4j()]);

        app.listen(process.env.PORT || 8000, () => {
            logger.success(`Server listening on port ${process.env.PORT || 8000}`);
        });
    } catch (error) {
        logger.error("Database connection attempt failed\n" + error);
        process.exit(1);
    }
};

startServer();
