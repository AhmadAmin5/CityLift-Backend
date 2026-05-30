import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import errorHandler from "./utils/errorHandler.js";
import ApiVersion from "./config/ApiVersion.js";

const app = express();

app.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN }));
app.use(express.json({ limit: "32mb" }));
app.use(express.urlencoded({ extended: true, limit: "32mb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.get(ApiVersion + "/", (req, res) => {
    res.status(200).json({ status: "ok", message: "Server is awake" });
});

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import riderRoutes from "./routes/rider.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import mapsRoutes from "./routes/maps.routes.js";
import rideRoutes from "./routes/rides.routes.js";
import adminRoutes from "./routes/admin.routes.js";

app.use(ApiVersion + "/auth", authRoutes);
app.use(ApiVersion + "/users", userRoutes);
app.use(ApiVersion + "/riders", riderRoutes);
app.use(ApiVersion + "/drivers", driverRoutes);
app.use(ApiVersion + "/maps", mapsRoutes);
app.use(ApiVersion + "/rides", rideRoutes);
app.use(ApiVersion + "/admin", adminRoutes);

app.use(errorHandler);

export default app;
