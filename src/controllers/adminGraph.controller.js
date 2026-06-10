import { driver as neo4jDriver } from "../db/neo4j.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// Helper to convert Neo4j values (like Integer objects) to standard JS values
const convertNeo4jValue = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val.toNumber === "function") {
        return val.toNumber();
    }
    if (typeof val === "object" && "low" in val) {
        return Number(val.low);
    }
    return val;
};

// Helper to format Neo4j record to a flat JS object
const formatNeo4jRecord = (record) => {
    const obj = {};
    record.keys.forEach((key) => {
        obj[key] = convertNeo4jValue(record.get(key));
    });
    return obj;
};

// ─── GET /api/v1/admin/analytics/graph/popular-routes ───────────────────
const getPopularRoutes = asyncHandler(async (req, res) => {
    if (!neo4jDriver) {
        throw new ApiError(503, "Neo4j database service is unavailable");
    }

    const session = neo4jDriver.session();
    try {
        const result = await session.run(`
            MATCH (ride:Ride)-[:PICKUP_IN]->(p:Area)
            MATCH (ride)-[:DROPOFF_IN]->(d:Area)
            RETURN p.name AS pickup_area, d.name AS dropoff_area, count(ride) AS ride_count
            ORDER BY ride_count DESC LIMIT 10
        `);

        const routes = result.records.map(formatNeo4jRecord);

        return res.status(200).json(
            new ApiResponse(200, { routes }, "Popular routes fetched successfully")
        );
    } finally {
        await session.close();
    }
});

// ─── GET /api/v1/admin/analytics/graph/collusion-detection ──────────────
const getCollusionDetection = asyncHandler(async (req, res) => {
    if (!neo4jDriver) {
        throw new ApiError(503, "Neo4j database service is unavailable");
    }

    const session = neo4jDriver.session();
    try {
        const result = await session.run(`
            MATCH (rider:Rider)-[:REQUESTED]->(ride:Ride)<-[:COMPLETED]-(driver:Driver)
            WITH rider, driver, count(ride) AS completed_count
            WHERE completed_count > 5
            RETURN rider.id AS rider_id, driver.id AS driver_id, completed_count
            ORDER BY completed_count DESC
        `);

        const collusionRecords = result.records.map(formatNeo4jRecord);

        return res.status(200).json(
            new ApiResponse(200, { collusion_records: collusionRecords }, "Potential collusion records fetched successfully")
        );
    } finally {
        await session.close();
    }
});

// ─── GET /api/v1/admin/analytics/graph/driver-density ───────────────────
const getDriverDensity = asyncHandler(async (req, res) => {
    if (!neo4jDriver) {
        throw new ApiError(503, "Neo4j database service is unavailable");
    }

    const session = neo4jDriver.session();
    try {
        const result = await session.run(`
            MATCH (d:Driver)-[:CURRENTLY_IN]->(a:Area)
            RETURN a.name AS area_name, count(d) AS driver_count
            ORDER BY driver_count DESC
        `);

        const density = result.records.map(formatNeo4jRecord);

        return res.status(200).json(
            new ApiResponse(200, { density }, "Driver density metrics fetched successfully")
        );
    } finally {
        await session.close();
    }
});

export {
    getPopularRoutes,
    getCollusionDetection,
    getDriverDensity
};
