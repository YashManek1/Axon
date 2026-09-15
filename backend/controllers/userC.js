import userModel from "../models/user.js";
import orgModel from "../models/organization.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { environment } from "../config/environment.js";
import { createChildLogger } from "../config/logger.js";
import {
  HUMAN_SESSION_AUDIENCE,
  HUMAN_SESSION_PURPOSE,
  InvalidIdentityError,
  isInvalidHumanSessionError,
} from "../middlewares/jwt.js";

const logger = createChildLogger({ module: "user-controller" });
const SESSION_COOKIE_NAME = "axon_session";
const SESSION_TTL_MS = 60 * 60 * 1000;
const REFRESH_WINDOW_SECONDS = 7 * 24 * 60 * 60;

// Browsers refuse to STORE a `Secure` cookie delivered over plain http, so
// hardcoding it to true silently broke every local session: the cookie was
// never persisted, /user/refresh failed, and any page reload logged the user
// out. Secure must therefore track the deployment scheme, not be a constant.
// It stays true everywhere except local development over http, so production
// and the test suite both keep asserting the hardened behaviour.
const useSecureCookies = environment.NODE_ENV !== "development";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: useSecureCookies,
    maxAge: SESSION_TTL_MS,
  };
}

export function signSessionToken(user) {
  const userId = user._id.toString();
  return jwt.sign(
    {
      purpose: HUMAN_SESSION_PURPOSE,
      id: userId,
      orgId: user.orgId,
      username: user.username,
      role: user.role,
    },
    environment.JWT_SECRET,
    {
      algorithm: "HS256",
      audience: HUMAN_SESSION_AUDIENCE,
      subject: userId,
      expiresIn: "1h",
    },
  );
}

function safeUser(user) {
  const output = { ...user._doc };
  delete output.password;
  return output;
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export const registerUser = async (req, res) => {
  try {
    const { username, email, password, orgName, orgDescription } = req.body;
    if (!username || !email || !password || !orgName) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    const existingUser = await userModel.findOne({
      email: email.trim().toLowerCase(),
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // P1: Never auto-join existing orgs. If org exists, reject with 409.
    const trimmedOrgName = orgName.trim().toLowerCase();
    const existingOrg = await orgModel.findOne({ name: trimmedOrgName });
    if (existingOrg) {
      return res.status(409).json({
        success: false,
        message: "An organization with that name already exists",
      });
    }

    // P4: Create new org and make the first user admin (the owner).
    const org = new orgModel({
      name: trimmedOrgName,
      description: orgDescription || "Default organization description",
    });
    await org.save();

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new userModel({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      orgId: org._id,
      role: "admin", // First user in org becomes admin
    });
    await newUser.save();

    const token = signSessionToken(newUser);
    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: safeUser(newUser),
      token,
    });
  } catch (error) {
    logger.error({ err: error, email: req.body?.email }, "Error registering user");
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const user = await userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = signSessionToken(user);
    setSessionCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: safeUser(user),
      token,
    });
  } catch (error) {
    logger.error({ err: error, email: req.body?.email }, "Error logging in user");
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const logoutUser = async (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: useSecureCookies,
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const refreshSession = async (req, res) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ message: "Session cookie missing" });
    }

    const decoded = jwt.verify(token, environment.JWT_SECRET, {
      algorithms: ["HS256"],
      audience: HUMAN_SESSION_AUDIENCE,
      ignoreExpiration: true,
    });
    if (
      decoded.purpose !== HUMAN_SESSION_PURPOSE ||
      !mongoose.Types.ObjectId.isValid(decoded.sub) ||
      !decoded.orgId
    ) {
      throw new InvalidIdentityError("Invalid session");
    }
    const issuedAtMs = Number(decoded.iat || 0) * 1000;

    if (!issuedAtMs || Date.now() - issuedAtMs > REFRESH_WINDOW_SECONDS * 1000) {
      return res.status(401).json({ message: "Session refresh window expired" });
    }

    const user = await userModel.findById(decoded.sub);
    if (!user || String(user.orgId) !== String(decoded.orgId)) {
      throw new InvalidIdentityError("Session user not found");
    }

    const refreshedToken = signSessionToken(user);
    setSessionCookie(res, refreshedToken);

    return res.status(200).json({
      success: true,
      user: safeUser(user),
      token: refreshedToken,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to refresh session");
    if (isInvalidHumanSessionError(error)) {
      return res.status(401).json({ message: "Invalid session" });
    }
    return res.status(503).json({ message: "Authentication service unavailable" });
  }
};
