import {
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
} from "../controllers/userC.js";
import express from "express";
import { validateRequest } from "../middleware/validateRequest.js";
import { loginSchema, registerSchema } from "../schemas/authSchemas.js";

const router = express.Router();

router.post("/register", validateRequest(registerSchema), registerUser);
router.post("/login", validateRequest(loginSchema), loginUser);
router.post("/logout", logoutUser);
router.post("/refresh", refreshSession);

export default router;
