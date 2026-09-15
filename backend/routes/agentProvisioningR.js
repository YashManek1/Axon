import express from "express";
import { authAdmin } from "../middlewares/jwt.js";
import {
  authAgentToken,
  decommissionAgent,
  refreshAgentToken,
  registerAgent,
  rotateAgentKey,
  updateAgentPermissions,
} from "../controllers/agentProvisioningC.js";

const router = express.Router();

router.post("/register", registerAgent);
router.post("/refresh-token", authAgentToken, refreshAgentToken);
router.post("/:agentId/rotate-key", authAdmin, rotateAgentKey);
router.patch("/:agentId/permissions", authAdmin, updateAgentPermissions);
router.delete("/:agentId", authAdmin, decommissionAgent);

export default router;
