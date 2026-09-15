import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { signSessionToken } from "../controllers/userC.js";
import { authUser } from "../middlewares/jwt.js";
import { authenticateSocket } from "../services/socketAuth.js";

const app = express();
app.get("/identity", authUser, (req, res) => res.status(200).json(req.user));

let org;
let otherOrg;
let user;

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
  [org, otherOrg] = await Promise.all([
    Organization.create({
      name: `human-session-a-${suffix}`,
      description: "Session org A",
    }),
    Organization.create({
      name: `human-session-b-${suffix}`,
      description: "Session org B",
    }),
  ]);
  user = await User.create({
    username: `session-user-${suffix}`,
    email: `session-user-${suffix}@example.com`,
    password: "hashed-password",
    role: "operator",
    orgId: org._id,
  });
});

describe("current human session identity", () => {
  it("uses the current database role for both HTTP and UI WebSocket auth", async () => {
    const token = signSessionToken(user);
    await User.updateOne({ _id: user._id }, { $set: { role: "admin" } });

    const httpResponse = await request(app)
      .get("/identity")
      .set("Authorization", `Bearer ${token}`);
    const socket = socketFor({ clientType: "ui", token });
    const socketError = await socketAuthResult(socket);

    expect(httpResponse.status).toBe(200);
    expect(httpResponse.body.role).toBe("admin");
    expect(socketError).toBeNull();
    expect(socket.user.role).toBe("admin");
  });

  it("rejects a token after the user membership moves to another organization", async () => {
    const token = signSessionToken(user);
    await User.updateOne({ _id: user._id }, { $set: { orgId: otherOrg._id } });

    const httpResponse = await request(app)
      .get("/identity")
      .set("Authorization", `Bearer ${token}`);
    const socketError = await socketAuthResult(
      socketFor({ clientType: "ui", token }),
    );

    expect(httpResponse.status).toBe(401);
    expect(socketError).toBeInstanceOf(Error);
    expect(socketError.message).toContain("Session membership is no longer valid");
  });

  it("rejects wrong-purpose and wrong-audience tokens over HTTP and UI WebSocket", async () => {
    const subject = String(user._id);
    const machinePurpose = jwt.sign(
      { purpose: "agent-token", orgId: String(org._id) },
      process.env.JWT_SECRET,
      { algorithm: "HS256", audience: "axon-ui", subject, expiresIn: "1h" },
    );
    const wrongAudience = jwt.sign(
      { purpose: "human-session", orgId: String(org._id) },
      process.env.JWT_SECRET,
      { algorithm: "HS256", audience: "other-client", subject, expiresIn: "1h" },
    );

    const [machineHttp, audienceHttp, machineSocketError, audienceSocketError] =
      await Promise.all([
        request(app).get("/identity").set("Authorization", `Bearer ${machinePurpose}`),
        request(app).get("/identity").set("Authorization", `Bearer ${wrongAudience}`),
        socketAuthResult(socketFor({ clientType: "ui", token: machinePurpose })),
        socketAuthResult(socketFor({ clientType: "ui", token: wrongAudience })),
      ]);

    expect([machineHttp.status, audienceHttp.status]).toEqual([401, 401]);
    expect(machineSocketError).toBeInstanceOf(Error);
    expect(audienceSocketError).toBeInstanceOf(Error);
  });
});
