import { beforeEach, describe, expect, it } from "vitest";
import Agent from "../models/agent.js";
import Organization from "../models/organization.js";
import { authenticateSocket } from "../services/socketAuth.js";

let agent;
let rawApiKey;

function socketFor(auth) {
  return {
    handshake: { auth, headers: {} },
    data: {},
  };
}

async function socketAuthResult(socket) {
  return new Promise((resolve) => {
    authenticateSocket(socket, (error) => resolve(error ?? null));
  });
}

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const org = await Organization.create({
    name: `agent-socket-auth-${suffix}`,
    description: "Agent socket release metadata tests",
  });
  rawApiKey = `agent-secret-${suffix}`;
  agent = await Agent.create({
    name: `agent-socket-${suffix}`,
    hardwareUuid: `agent-socket-${suffix}`,
    apiKey: rawApiKey,
    orgId: org._id,
  });
});

describe("agent socket release identity", () => {
  it("accepts and stores a trimmed release id", async () => {
    const socket = socketFor({
      agentId: String(agent._id),
      apiKey: rawApiKey,
      protocolVersions: [2],
      releaseId: " release-a ",
    });

    expect(await socketAuthResult(socket)).toBeNull();
    expect(socket.releaseId).toBe("release-a");
    expect(socket.data.releaseId).toBe("release-a");
    expect(socket.protocolVersions).toEqual([2]);
  });

  it("keeps legacy authentication compatible when release id is missing", async () => {
    const socket = socketFor({
      agentId: String(agent._id),
      apiKey: rawApiKey,
      protocolVersions: [2],
    });

    expect(await socketAuthResult(socket)).toBeNull();
    expect(socket.releaseId).toBeNull();
    expect(socket.data.releaseId).toBeNull();
  });
});
