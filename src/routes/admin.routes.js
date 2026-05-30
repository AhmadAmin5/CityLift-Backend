import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";
import ApiError from "../utils/ApiError.js";
import {
    listPricingRules,
    createPricingRule,
    updatePricingRule
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

export default router;

