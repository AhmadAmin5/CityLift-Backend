import pg from "pg";
import logger from "../utils/logger.js";

const { Pool } = pg;

let pool;

const connectPostgres = async () => {
    try {
        logger.info("Connecting PostgreSQL...");

        pool = new Pool({
            connectionString: process.env.POSTGRES_URI,
            ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false
        });

        const connectionInstance = await pool.query("SELECT NOW()");

        if (connectionInstance) {
            logger.success("PostgreSQL connected");
            // logger.info("PostgreSQL time: " + connectionInstance.rows[0].now);
        }

        return pool;
    } catch (error) {
        logger.error("Failed to connect PostgreSQL");
        throw error;
    }
};

export { pool };
export default connectPostgres;
