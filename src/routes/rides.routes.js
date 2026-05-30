import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";
import {
    estimateRideFare,
    createRideRequest,
    listMyRides,
    getRideDetails,
    getRideRoute,
    getRideLiveState,
    cancelRide,
    driverArrived,
    driverStartRide,
    submitTrackingPoint,
    getTrackingHistory,
    completeRide,
    submitRating,
    getRideReceipt
} from "../controllers/rides.controller.js";

const router = Router();

router.use(verifyJWT);

router.post("/estimate", estimateRideFare);
router.post("/", createRideRequest);
router.get("/", listMyRides);
router.get("/:ride_id", getRideDetails);
router.get("/:ride_id/route", getRideRoute);
router.get("/:ride_id/live", getRideLiveState);
router.post("/:ride_id/cancel", cancelRide);
router.post("/:ride_id/arrive", driverArrived);
router.post("/:ride_id/start", driverStartRide);
router.post("/:ride_id/tracking", submitTrackingPoint);
router.get("/:ride_id/tracking", getTrackingHistory);
router.post("/:ride_id/complete", completeRide);
router.post("/:ride_id/rating", submitRating);
router.get("/:ride_id/receipt", getRideReceipt);

export default router;
