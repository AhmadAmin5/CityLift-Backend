import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";

import {
    getCurrentDriverProfile,
    updateDriverAvailability,
    updateDriverLocation,
    getDriverDocuments,
    uploadDriverDocument,
    getMyVehicles,
    createVehicle,
    updateVehicle,
    setActiveVehicle,
    listMyRideOffers,
    acceptRideOffer,
    declineRideOffer,
    getDriverEarningsDashboard,
    getDriverRatings
} from "../controllers/driver.controller.js";

import upload from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/me", getCurrentDriverProfile);
router.patch("/me/availability", updateDriverAvailability);
router.post("/me/location", updateDriverLocation);
router.get("/me/documents", getDriverDocuments);
router.post("/me/documents", upload.single("file"), uploadDriverDocument);
router.get("/me/vehicles", getMyVehicles);
router.post("/me/vehicles", createVehicle);
router.patch("/me/vehicles/:vehicle_id", updateVehicle);
router.post("/me/vehicles/:vehicle_id/set-active", setActiveVehicle);

router.get("/me/ride-offers", listMyRideOffers);
router.post("/me/ride-offers/:offer_id/accept", acceptRideOffer);
router.post("/me/ride-offers/:offer_id/decline", declineRideOffer);

router.get("/me/earnings", getDriverEarningsDashboard);
router.get("/me/ratings", getDriverRatings);

export default router;