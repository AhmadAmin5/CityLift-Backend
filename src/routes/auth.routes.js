import { Router } from "express";

import verifyJWT from "../middlewares/auth.middleware.js";

import { registerDriver, registerRider, loginUser, logoutUser, getCurrentUser } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register/rider", registerRider);
router.post("/register/driver", registerDriver);
router.post("/login", loginUser);
router.post("/logout", verifyJWT, logoutUser);
router.get("/me", verifyJWT, getCurrentUser);

export default router;
