import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requestId } from "../middleware/requestId.js";
import { authUser } from "../middlewares/jwt.js";
import userRoutes from "../routes/userR.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(requestId);
app.use("/user", userRoutes);
app.get("/protected", authUser, (req, res) => {
  res.status(200).json({ userId: req.user.id, orgId: req.user.orgId });
});

const validUser = {
  username: "Cookie User",
  email: "cookie@example.com",
  password: "correct-password",
  orgName: "Cookie Org",
  orgDescription: "Organization for cookie auth tests",
};

function sessionCookie(setCookieHeader) {
  return setCookieHeader.find((cookie) => cookie.startsWith("axon_session="));
}

async function registerAndLogin() {
  await request(app).post("/user/register").send(validUser);
  return request(app).post("/user/login").send({
    email: validUser.email,
    password: validUser.password,
  });
}

describe("auth cookies", () => {
  it("POST /user/login sets axon_session cookie with httpOnly flag", async () => {
    const response = await registerAndLogin();
    const cookie = sessionCookie(response.headers["set-cookie"]);

    expect(response.status).toBe(200);
    expect(cookie).toContain("axon_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
  });

  it("subsequent request with cookie and no Authorization header is authenticated", async () => {
    const loginResponse = await registerAndLogin();
    const cookie = sessionCookie(loginResponse.headers["set-cookie"]);

    const response = await request(app).get("/protected").set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: loginResponse.body.user._id,
      orgId: loginResponse.body.user.orgId,
    });
  });

  it("POST /user/logout clears the session cookie", async () => {
    const response = await request(app).post("/user/logout");
    const cookie = sessionCookie(response.headers["set-cookie"]);

    expect(response.status).toBe(200);
    expect(cookie).toContain("axon_session=");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("POST /user/refresh with valid session cookie sets a new cookie", async () => {
    const loginResponse = await registerAndLogin();
    const cookie = sessionCookie(loginResponse.headers["set-cookie"]);

    const response = await request(app).post("/user/refresh").set("Cookie", cookie);
    const refreshedCookie = sessionCookie(response.headers["set-cookie"]);

    expect(response.status).toBe(200);
    expect(refreshedCookie).toContain("axon_session=");
    expect(refreshedCookie).toContain("HttpOnly");
    expect(response.body.user._id).toBe(loginResponse.body.user._id);
  });

  it("POST /user/refresh with expired but recent token succeeds", async () => {
    const loginResponse = await registerAndLogin();
    const issuedAt = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    const token = jwt.sign(
      {
        id: loginResponse.body.user._id,
        orgId: loginResponse.body.user.orgId,
        username: loginResponse.body.user.username,
        role: loginResponse.body.user.role,
        iat: issuedAt,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app)
      .post("/user/refresh")
      .set("Cookie", `axon_session=${token}`);

    expect(response.status).toBe(200);
    expect(sessionCookie(response.headers["set-cookie"])).toContain("axon_session=");
  });

  it("POST /user/refresh with token older than 7 days returns 401", async () => {
    const loginResponse = await registerAndLogin();
    const issuedAt = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    const token = jwt.sign(
      {
        id: loginResponse.body.user._id,
        orgId: loginResponse.body.user.orgId,
        username: loginResponse.body.user.username,
        role: loginResponse.body.user.role,
        iat: issuedAt,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app)
      .post("/user/refresh")
      .set("Cookie", `axon_session=${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Session refresh window expired" });
  });
});
