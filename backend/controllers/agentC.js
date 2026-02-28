import Agent from "../models/agent.js";

// Get all agents for the authenticated user's organization
export const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find({ orgId: req.user.orgId })
      .select("-apiKey")
      .sort({ status: 1, lastSeen: -1 });
    return res.status(200).json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    return res.status(500).json({ message: "Failed to fetch agents" });
  }
};

// Get a single agent by ID
export const getAgentById = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      orgId: req.user.orgId,
    }).select("-apiKey");

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    return res.status(200).json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    return res.status(500).json({ message: "Failed to fetch agent" });
  }
};
