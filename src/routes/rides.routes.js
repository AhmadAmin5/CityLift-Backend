import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";
import { estimateRideFare, createRideRequest } from "../controllers/rides.controller.js";

const router = Router();

router.use(verifyJWT);

router.post("/estimate", estimateRideFare);
router.post("/", createRideRequest);

export default router;
