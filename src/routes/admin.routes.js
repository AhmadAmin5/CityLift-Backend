import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";
import ApiError from "../utils/ApiError.js";
import {
    listPricingRules,
    createPricingRule,
    updatePricingRule,
    reviewDriverDocument,
    updateDriverApproval,
    upsertSurgeZone
} from "../controllers/admin.controller.js";

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

router.patch("/driver-documents/:document_id/review", reviewDriverDocument);

router.patch("/drivers/:driver_id/approval", updateDriverApproval);

router.post("/surge-zones", upsertSurgeZone);

export default router;
