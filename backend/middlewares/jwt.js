import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { environment } from "../config/environment.js";
import User from "../models/user.js";

export const HUMAN_SESSION_PURPOSE = "human-session";
export const HUMAN_SESSION_AUDIENCE = "axon-ui";

export class InvalidIdentityError extends Error {}

export function isInvalidHumanSessionError(error) {
  return (
    error instanceof jwt.JsonWebTokenError ||
    error instanceof jwt.TokenExpiredError ||
    error instanceof InvalidIdentityError
  );
}

function jobPerms(resource) {
  return {
    allowedUsers: resource.permissions?.allowedUsers ?? [],
    allowedRoles: resource.permissions?.allowedRoles ?? [],
  };
}

function effectiveRoles(role) {
  return role === "user" ? ["user", "operator"] : [role];
}

export function hasResourceAccess(user, resource, getPerms = jobPerms) {
  if (user?.role === "admin") return true;

  const { allowedUsers = [], allowedRoles = [] } = getPerms(resource);
  if (allowedUsers.length === 0 && allowedRoles.length === 0) return true;

  const userId = String(user?.id ?? user?._id);
  const userAllowed = allowedUsers.some((id) => String(id) === userId);
  const roleAllowed = effectiveRoles(user?.role).some((role) =>
    allowedRoles.includes(role),
  );

  return userAllowed || roleAllowed;
}

export function resourceAccessFilter(user) {
  if (user?.role === "admin") return { orgId: user.orgId };

  return {
    orgId: user.orgId,
    $or: [
      {
        $and: [
          { "permissions.allowedUsers.0": { $exists: false } },
          { "permissions.allowedRoles.0": { $exists: false } },
        ],
      },
      { "permissions.allowedUsers": user.id },
      { "permissions.allowedRoles": { $in: effectiveRoles(user.role) } },
    ],
  };
}

export async function resolveHumanSession(token, options = {}) {
  const payload = jwt.verify(token, environment.JWT_SECRET, {
    algorithms: ["HS256"],
    audience: HUMAN_SESSION_AUDIENCE,
    ignoreExpiration: options.ignoreExpiration === true,
  });

  if (
    payload.purpose !== HUMAN_SESSION_PURPOSE ||
    !mongoose.Types.ObjectId.isValid(payload.sub) ||
    !payload.orgId
  ) {
    throw new InvalidIdentityError("Invalid human session purpose or subject");
  }

  const user = await User.findById(payload.sub);
  if (!user || String(user.orgId) !== String(payload.orgId)) {
    throw new InvalidIdentityError("Session membership is no longer valid");
  }

  return {
    id: user._id.toString(),
    _id: user._id.toString(),
    orgId: user.orgId.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    purpose: HUMAN_SESSION_PURPOSE,
    sub: user._id.toString(),
  };
}

function requestToken(req) {
  const token = req.cookies?.axon_session || req.header("Authorization");
  if (!token) return null;
  return token.startsWith("Bearer ") ? token.slice(7) : token;
}

export const authUser = async (req, res, next) => {
  const token = requestToken(req);
  if (!token) return res.status(401).send("Access Denied");

  try {
    req.user = await resolveHumanSession(token);
    return next();
  } catch (error) {
    if (isInvalidHumanSessionError(error)) {
      return res.status(401).json({ message: "Invalid token" });
    }
    return res.status(503).json({ message: "Authentication service unavailable" });
  }
};

export const authAdmin = async (req, res, next) => {
  return authUser(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin privileges required" });
    }
    return next();
  });
};

export function authRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: "Insufficient privileges" });
    }
    return next();
  };
}

export function authResource(Model, paramKey, getPerms = jobPerms) {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramKey];
      if (!mongoose.Types.ObjectId.isValid(resourceId)) {
        return res.status(404).json({ message: "Not found" });
      }

      const resource = await Model.findOne({
        _id: resourceId,
        orgId: req.user.orgId,
      });
      if (!resource) return res.status(404).json({ message: "Not found" });

      req.resource = resource;
      if (hasResourceAccess(req.user, resource, getPerms)) return next();
      return res.status(403).json({ message: "Access denied" });
    } catch {
      return res.status(500).json({ message: "Authorization check failed" });
    }
  };
}
