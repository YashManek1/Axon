import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requestId } from "../middleware/requestId.js";
import userRoutes from "../routes/userR.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestId);
app.use("/user", userRoutes);

const validUser = {
  username: "Test User",
  email: "test@example.com",
  password: "correct-password",
  orgName: "Test Org",
  orgDescription: "Organization for auth integration tests",
};

function expectUserShape(user, overrides = {}) {
  expect(user).toEqual(
    expect.objectContaining({
      _id: expect.any(String),
      username: overrides.username ?? expect.any(String),
      email: overrides.email ?? expect.any(String),
      orgId: expect.any(String),
      role: "user",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      __v: expect.any(Number),
    }),
  );
  expect(user).not.toHaveProperty("password");
}

describe("auth routes", () => {
  it("POST /user/register with valid data returns 201, token, and user object", async () => {
    const response = await request(app).post("/user/register").send(validUser);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      message: "User registered successfully",
      user: expect.any(Object),
      token: expect.any(String),
    });
    expectUserShape(response.body.user, {
      username: validUser.username,
      email: validUser.email,
    });
  });

  it("POST /user/register with duplicate email returns 400", async () => {
    await request(app).post("/user/register").send(validUser);

    const response = await request(app).post("/user/register").send({
      ...validUser,
      username: "Another User",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "User already exists",
    });
  });

  it("POST /user/register with missing fields returns 400", async () => {
    const response = await request(app).post("/user/register").send({
      email: "missing@example.com",
      password: "correct-password",
      orgName: "Missing Fields Org",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "VALIDATION_ERROR",
      issues: [
        {
          field: "username",
          message: expect.any(String),
        },
      ],
    });
  });

  it("POST /user/login with valid credentials returns 200 and token", async () => {
    await request(app).post("/user/register").send(validUser);

    const response = await request(app).post("/user/login").send({
      email: validUser.email,
      password: validUser.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Login successful",
      user: expect.any(Object),
      token: expect.any(String),
    });
    expectUserShape(response.body.user, {
      username: validUser.username,
      email: validUser.email,
    });
  });

  it("POST /user/login with wrong password returns 401", async () => {
    await request(app).post("/user/register").send(validUser);

    const response = await request(app).post("/user/login").send({
      email: validUser.email,
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: "Invalid credentials",
    });
  });

  it("POST /user/login with nonexistent email returns 404", async () => {
    const response = await request(app).post("/user/login").send({
      email: "nobody@example.com",
      password: "correct-password",
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "User not found",
    });
  });
});
