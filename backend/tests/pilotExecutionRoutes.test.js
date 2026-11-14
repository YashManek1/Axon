import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Job from "../models/job.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { signSessionToken } from "../controllers/userC.js";

const queueMocks = vi.hoisted(() => ({
  scheduledAdd: vi.fn(),
  scheduledRemove: vi.fn(),
  immediateAdd: vi.fn(),
}));

vi.mock("../config/queue.js", () => ({
  scheduledJobsQueue: {
    add: queueMocks.scheduledAdd,
    removeRepeatable: queueMocks.scheduledRemove,
  },
  immediateJobsQueue: { add: queueMocks.immediateAdd },
  redisConnection: { on: vi.fn(), set: vi.fn(), get: vi.fn() },
}));

vi.mock("../services/executionPolicy.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getExecutionPolicyViolation: (definition) =>
      actual.getExecutionPolicyViolation(definition, "pilot"),
  };
});

let app;
let org;
let user;
let authorization;

beforeAll(async () => {
  const { default: routes } = await import("../routes/jobR.js");
  app = express();
  app.use(express.json());
  app.use("/jobs", routes);
});

beforeEach(async () => {
  vi.clearAllMocks();
  org = await Organization.create({
    name: `pilot-policy-${Date.now()}-${Math.random()}`,
    description: "pilot execution policy test",
  });
  user = await User.create({
    username: `pilot-${Date.now()}-${Math.random()}`,
    email: `pilot-${Date.now()}-${Math.random()}@example.com`,
    password: "hashed",
    role: "operator",
    orgId: org._id,
  });
  authorization = `Bearer ${signSessionToken(user)}`;
});

function shellJob(overrides = {}) {
  return Job.create({
    userId: user._id,
    orgId: org._id,
    name: "safe-shell",
    type: "shell",
    schedule: "0 * * * *",
    payload: { command: "uptime" },
    enabled: false,
    ...overrides,
  });
}

describe("pilot execution API containment", () => {
  it("rejects direct HTTP creation without persistence or queueing", async () => {
    const response = await request(app)
      .post("/jobs/createJob")
      .set("Authorization", authorization)
      .send({
        name: "metadata probe",
        type: "http",
        schedule: "* * * * *",
        payload: { url: "http://169.254.169.254/latest/meta-data", method: "GET" },
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("HTTP_EXECUTION_DISABLED");
    expect(await Job.countDocuments({ orgId: org._id })).toBe(0);
    expect(queueMocks.scheduledAdd).not.toHaveBeenCalled();
  });

  it.each([
    [{ webhookUrl: "https://example.com/hook" }, "WEBHOOK_EXECUTION_DISABLED"],
    [{ sink: { type: "mongo", uri: "mongodb://example", collectionName: "out" } }, "EXTERNAL_SINK_DISABLED"],
  ])("rejects outbound shell attachments through the API", async (extra, code) => {
    const response = await request(app)
      .post("/jobs/createJob")
      .set("Authorization", authorization)
      .send({
        name: "unsafe attachment",
        type: "shell",
        schedule: "0 * * * *",
        payload: { command: "uptime" },
        ...extra,
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(code);
    expect(await Job.countDocuments({ orgId: org._id })).toBe(0);
  });

  it("rejects update attempts before mutating the stored job", async () => {
    const job = await shellJob();
    const response = await request(app)
      .put(`/jobs/updateJob/${job._id}`)
      .set("Authorization", authorization)
      .send({ webhookUrl: "https://example.com/hook" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("WEBHOOK_EXECUTION_DISABLED");
    expect((await Job.findById(job._id)).webhookUrl).toBeNull();
  });

  it("keeps legacy HTTP records immutable and blocks all execution controls", async () => {
    const job = await shellJob({
      name: "legacy-http",
      type: "http",
      payload: { url: "https://example.com", method: "GET" },
    });
    const [toggle, run] = await Promise.all([
      request(app)
        .patch(`/jobs/toggleJobStatus/${job._id}`)
        .set("Authorization", authorization),
      request(app)
        .post(`/jobs/runJobNow/${job._id}`)
        .set("Authorization", authorization),
    ]);
    expect(toggle.status).toBe(409);
    expect(run.status).toBe(409);
    expect(toggle.body.code).toBe("HTTP_EXECUTION_DISABLED");
    expect(run.body.code).toBe("HTTP_EXECUTION_DISABLED");

    const update = await request(app)
      .put(`/jobs/updateJob/${job._id}`)
      .set("Authorization", authorization)
      .send({ type: "shell", payload: { command: "uptime" } });
    expect(update.status).toBe(409);
    expect(update.body.code).toBe("HTTP_EXECUTION_DISABLED");
    expect((await Job.findById(job._id)).type).toBe("http");
    expect(queueMocks.scheduledAdd).not.toHaveBeenCalled();
    expect(queueMocks.immediateAdd).not.toHaveBeenCalled();
  });
});
