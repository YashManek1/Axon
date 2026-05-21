import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { requestId } from "../middleware/requestId.js";

vi.mock("../config/queue.js", () => ({
  scheduledJobsQueue: {
    add: vi.fn(),
    removeRepeatable: vi.fn(),
  },
  immediateJobsQueue: {
    add: vi.fn(),
  },
  redisConnection: {
    on: vi.fn(),
  },
}));

let app;

beforeAll(async () => {
  const [{ default: userRoutes }, { default: jobRoutes }] = await Promise.all([
    import("../routes/userR.js"),
    import("../routes/jobR.js"),
  ]);

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use("/user", userRoutes);
  app.use("/jobs", jobRoutes);
});

function expectRequestId(response) {
  expect(response.headers["x-request-id"]).toEqual(expect.any(String));
}

function authHeader() {
  const token = jwt.sign(
    {
      id: "507f1f77bcf86cd799439011",
      orgId: "507f1f77bcf86cd799439012",
      username: "Test User",
      role: "user",
    },
    process.env.JWT_SECRET,
  );

  return `Bearer ${token}`;
}

const validRegisterBody = {
  username: "Test User",
  email: "test@example.com",
  password: "correct-password",
  orgName: "Test Org",
};

describe("request validation", () => {
  it("POST /user/register with too-short username returns 400 with VALIDATION_ERROR", async () => {
    const response = await request(app)
      .post("/user/register")
      .send({ ...validRegisterBody, username: "a" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "VALIDATION_ERROR",
      issues: expect.arrayContaining([
        expect.objectContaining({
          field: "username",
          message: expect.any(String),
        }),
      ]),
    });
    expectRequestId(response);
  });

  it("POST /user/register with invalid email returns 400 with VALIDATION_ERROR", async () => {
    const response = await request(app)
      .post("/user/register")
      .send({ ...validRegisterBody, email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "email",
          message: expect.any(String),
        }),
      ]),
    );
    expectRequestId(response);
  });

  it("POST /user/register with too-short password returns 400", async () => {
    const response = await request(app)
      .post("/user/register")
      .send({ ...validRegisterBody, password: "1234567" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "password",
          message: expect.any(String),
        }),
      ]),
    );
    expectRequestId(response);
  });

  it("POST /user/login with missing password returns 400", async () => {
    const response = await request(app)
      .post("/user/login")
      .send({ email: "test@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "password",
          message: expect.any(String),
        }),
      ]),
    );
    expectRequestId(response);
  });

  it("POST /jobs/createJob without auth returns 401 before validation", async () => {
    const response = await request(app).post("/jobs/createJob").send({});

    expect(response.status).toBe(401);
    expect(response.text).toBe("Access Denied");
    expectRequestId(response);
  });

  it("POST /jobs/createJob with auth but invalid body returns 400 with VALIDATION_ERROR", async () => {
    const response = await request(app)
      .post("/jobs/createJob")
      .set("Authorization", authHeader())
      .send({
        name: "Invalid Job",
        type: "http",
        schedule: "not-cron",
        payload: {
          method: "GET",
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "schedule",
          message: expect.any(String),
        }),
      ]),
    );
    expectRequestId(response);
  });
});
