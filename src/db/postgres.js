import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "../generated/prisma/index.js";
const { PrismaClient } = pkg;
import logger from "../utils/logger.js";

const connectionString = process.env.POSTGRES_URI;

const ssl = process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false;

const adapter = new PrismaPg({
    connectionString,
    ssl
});

const prisma = new PrismaClient({
    adapter
});

const connectPostgres = async () => {
    try {
        if (!connectionString) {
            throw new Error("POSTGRES_URI is missing in environment variables");
        }

        logger.info("Connecting PostgreSQL...");

        await prisma.$connect();

        const connectionInstance = await prisma.$queryRaw`SELECT NOW()`;

        if (connectionInstance) {
            logger.success("PostgreSQL connected");
        }

        return prisma;
    } catch (error) {
        logger.error("Failed to connect PostgreSQL");
        throw error;
    }
};

export { prisma };
export default connectPostgres;
