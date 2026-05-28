import { driver as neo4jDriver } from "../../db/neo4j.js";

const updateDriverCurrentArea = async ({ driverId, currentArea }) => {
    if (!neo4jDriver || !currentArea) return;

    const session = neo4jDriver.session();

    try {
        await session.run(
            `
            MERGE (d:Driver {id: $driverId})
            MERGE (a:Area {name: $currentArea})

            OPTIONAL MATCH (d)-[oldRel:CURRENTLY_IN]->(:Area)
            DELETE oldRel

            MERGE (d)-[:CURRENTLY_IN]->(a)
            `,
            {
                driverId,
                currentArea
            }
        );
    } finally {
        await session.close();
    }
};

export { updateDriverCurrentArea };
