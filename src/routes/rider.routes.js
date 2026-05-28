import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";
import {
    getCurrentRiderProfile,
    listSavedPlaces,
    createSavedPlace,
    updateSavedPlace,
    deleteSavedPlace
} from "../controllers/rider.controller.js";

const router = Router();

router.use(verifyJWT);

router.get("/me", getCurrentRiderProfile);

router.get("/me/saved-places", listSavedPlaces);

router.post("/me/saved-places", createSavedPlace);

router.patch("/me/saved-places/:saved_place_id", updateSavedPlace);

router.delete("/me/saved-places/:saved_place_id", deleteSavedPlace);

export default router;
