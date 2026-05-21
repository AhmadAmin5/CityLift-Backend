import neo4j from "neo4j-driver";
import logger from "../utils/logger.js";

let driver;

const connectNeo4j = async () => {
    try {
        logger.info("Connecting Neo4j...");

        if (!process.env.NEO4J_URI || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD)
            throw new Error("Neo4j credentials messing in .env");

        driver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
        );

        await driver.getServerInfo();

        logger.success("Neo4j connected");

        return driver;
    } catch (error) {
        logger.error("Failed to connect Neo4j");
        logger.error(error.message);
        throw error;
    }
};

export { driver };
export default connectNeo4j;
