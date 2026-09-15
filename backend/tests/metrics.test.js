import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../config/environment.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    environment: { ...actual.environment },
  };
});

import { register } from "../metrics.js";
import { environment } from "../config/environment.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { signSessionToken } from "../controllers/userC.js";

describe("prom-client registry", () => {
  it("contains axon_job_dispatch_duration_seconds metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_job_dispatch_duration_seconds");
  });

  it("contains axon_job_status_total metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_job_status_total");
  });

  it("contains axon_agent_connected metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_agent_connected");
  });

  it("contains axon_agent_dispatch_ack_latency_seconds metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_agent_dispatch_ack_latency_seconds");
  });

  it("contains axon_http_request_duration_seconds metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_http_request_duration_seconds");
  });

  it("contains axon_http_request_total metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_http_request_total");
  });

  it("contains axon_queue_depth metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_queue_depth");
  });

  it("contains axon_audit_chain_verification_failures_total metric", async () => {
    const text = await register.metrics();
    expect(text).toContain("axon_audit_chain_verification_failures_total");
  });

  it("returns prometheus text format", async () => {
    const text = await register.metrics();
    expect(register.contentType).toMatch(/text\/plain/);
    expect(text).toMatch(/^# HELP /m);
    expect(text).toMatch(/^# TYPE /m);
  });
});

describe("GET /admin/metrics", () => {
  let app;

  beforeAll(async () => {
    const adminRouter = await import("../routes/adminR.js");
    app = express();
    app.use(express.json());
    app.use("/admin", adminRouter.default);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/admin/metrics");
    expect(res.status).toBe(401);
  });

  it("does not expose global metrics to an organization admin", async () => {
    const org = await Organization.create({
      name: `metrics-${Date.now()}`,
      description: "Metrics authorization test organization",
    });
    const user = await User.create({
      username: `metrics-admin-${Date.now()}`,
      email: `metrics-admin-${Date.now()}@example.com`,
      password: "hashed",
      role: "admin",
      orgId: org._id,
    });
    const token = signSessionToken(user);
    const res = await request(app)
      .get("/admin/metrics")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/service credential/);
  });
});

describe("GET /admin/metrics/prometheus", () => {
  let app;

  beforeAll(async () => {
    const adminRouter = await import("../routes/adminR.js");
    app = express();
    app.use(express.json());
    app.use("/admin", adminRouter.default);
  });

  it("returns 403 when PROMETHEUS_BEARER_TOKEN is not configured", async () => {
    const originalToken = environment.PROMETHEUS_BEARER_TOKEN;
    try {
      delete environment.PROMETHEUS_BEARER_TOKEN;
      const res = await request(app).get("/admin/metrics/prometheus");
      expect(res.status).toBe(403);
    } finally {
      environment.PROMETHEUS_BEARER_TOKEN = originalToken;
    }
  });

  it("returns 401 without bearer token", async () => {
    const res = await request(app).get("/admin/metrics/prometheus");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid bearer token", async () => {
    const res = await request(app)
      .get("/admin/metrics/prometheus")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid bearer token when configured", async () => {
    const res = await request(app)
      .get("/admin/metrics/prometheus")
      .set("Authorization", `Bearer ${environment.PROMETHEUS_BEARER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("axon_job_dispatch_duration_seconds");
  });
});
