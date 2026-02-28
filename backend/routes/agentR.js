import express from "express";
import { authUser } from "../middlewares/jwt.js";
import { getAgents, getAgentById } from "../controllers/agentC.js";

const router = express.Router();

router.get("/getAgents", authUser, getAgents);
router.get("/getAgent/:agentId", authUser, getAgentById);

export default router;
