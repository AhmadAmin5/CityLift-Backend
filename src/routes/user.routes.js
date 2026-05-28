import { Router } from "express";

import { uploadProfilePhoto, updateCurrentUserProfile } from "../controllers/user.controller.js";

import upload from "../middlewares/multer.middleware.js";

import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

router.post('/me/profile-photo', verifyJWT, upload.single("profile_photo"), uploadProfilePhoto);
router.patch('/me', verifyJWT, updateCurrentUserProfile);


export default router;