import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";
import ApiError from "../utils/ApiError.js";
import {
    listPricingRules,
    createPricingRule,
    updatePricingRule,
    reviewDriverDocument,
    updateDriverApproval,
    upsertSurgeZone,
    listMlModels,
    getFarePredictionLogs,
    listDriverDocuments,
    listPendingVehicles,
    updateVehicleVerification
} from "../controllers/admin.controller.js";
import {
    getPopularRoutes,
    getCollusionDetection,
    getDriverDensity
} from "../controllers/adminGraph.controller.js";

const router = Router();

router.use(verifyJWT);

// router.use((req, res, next) => {
//     if (req.user.role !== "admin") {
//         throw new ApiError(403, "Access denied. Admin account required");
//     }
//     next();
// });

router.get("/pricing-rules", listPricingRules);

router.post("/pricing-rules", createPricingRule);

router.patch("/pricing-rules/:pricing_rule_id", updatePricingRule);

router.get("/driver-documents", listDriverDocuments);

router.patch("/driver-documents/:document_id/review", reviewDriverDocument);

router.patch("/drivers/:driver_id/approval", updateDriverApproval);

router.get("/vehicles/pending", listPendingVehicles);

router.patch("/vehicles/:vehicle_id/verification", updateVehicleVerification);

router.post("/surge-zones", upsertSurgeZone);

router.get("/ml-models", listMlModels);

router.get("/rides/:ride_id/fare-prediction-logs", getFarePredictionLogs);

router.get("/analytics/graph/popular-routes", getPopularRoutes);
router.get("/analytics/graph/collusion-detection", getCollusionDetection);
router.get("/analytics/graph/driver-density", getDriverDensity);

export default router;
