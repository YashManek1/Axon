import userModel from "../models/user.js";
import orgModel from "../models/organization.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { environment } from "../config/environment.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "user-controller" });
const SESSION_COOKIE_NAME = "axon_session";
const SESSION_TTL_MS = 60 * 60 * 1000;
const REFRESH_WINDOW_SECONDS = 7 * 24 * 60 * 60;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: SESSION_TTL_MS,
  };
}

function signSessionToken(user) {
  return jwt.sign(
    {
      id: user._id,
      orgId: user.orgId,
      username: user.username,
      role: user.role,
    },
    environment.JWT_SECRET,
    { expiresIn: "1h" },
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

    let org = await orgModel.findOne({ name: orgName.trim().toLowerCase() });
    if (!org) {
      org = new orgModel({
        name: orgName.trim().toLowerCase(),
        description: orgDescription || "Default organization description",
      });
      await org.save();
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new userModel({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      orgId: org._id,
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

    const user = await userModel.findOne({ email: email.trim().toLowerCase() });
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
    secure: true,
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
      ignoreExpiration: true,
    });
    const issuedAtMs = Number(decoded.iat || 0) * 1000;

    if (!issuedAtMs || Date.now() - issuedAtMs > REFRESH_WINDOW_SECONDS * 1000) {
      return res.status(401).json({ message: "Session refresh window expired" });
    }

    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "Session user not found" });
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
    return res.status(401).json({ message: "Invalid session" });
  }
};
