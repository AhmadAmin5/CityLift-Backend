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

app.use(errorHandler);

export default app;
