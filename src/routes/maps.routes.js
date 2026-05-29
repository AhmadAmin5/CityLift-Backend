import { Router } from "express";
import verifyJWT from "../middlewares/auth.middleware.js";
import {
    getMapConfig,
    autocomplete,
    reverseGeocode,
    getRoutePreview,
    getNearbyDrivers,
    getSurgeZones,
    placeDetails
} from "../controllers/maps.controller.js";

const router = Router();

// All maps routes require authentication
router.use(verifyJWT);

router.get("/config", getMapConfig);
router.get("/autocomplete", autocomplete);
router.get("/place-details", placeDetails);
router.get("/reverse-geocode", reverseGeocode);
router.post("/route-preview", getRoutePreview);
router.get("/nearby-drivers", getNearbyDrivers);
router.get("/surge-zones", getSurgeZones);

export default router;
