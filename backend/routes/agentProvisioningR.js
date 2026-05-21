import express from "express";
import { authAdmin } from "../middlewares/jwt.js";
import {
  decommissionAgent,
  registerAgent,
  rotateAgentKey,
} from "../controllers/agentProvisioningC.js";

const router = express.Router();

router.post("/register", registerAgent);
router.post("/:agentId/rotate-key", authAdmin, rotateAgentKey);
router.delete("/:agentId", authAdmin, decommissionAgent);

export default router;
