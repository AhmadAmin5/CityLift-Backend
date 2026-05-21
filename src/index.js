import dotenv from "dotenv/config";
// import app from "./app.js";
import connectMongoDB from "./db/mongodb.js";
import logger from "./utils/logger.js";

connectMongoDB()
    .then(() => {
        logger.success(`Server listening on port ${process.env.PORT}`);

        // app.listen(process.env.PORT || 8000, () => {
        //     logger.success(`Server listening on port ${process.env.PORT}`);
        // });
    })
    .catch((error) => {
        logger.error("MongoDB connection attempt failed\n" + error);
        process.exit(1);
    });
