import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const authUser = async (req, res, next) => {
  const token = req.cookies?.axon_session || req.header("Authorization");
  if (!token) return res.status(401).send("Access Denied");
  try {
    const bearerToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    if (bearerToken == null) {
      return res.status(401).json({ message: "token null" });
    }
    const verified = jwt.verify(bearerToken, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(400).json({ message: "Invalid token" });
  }
};

export const authAdmin = async (req, res, next) => {
  const token = req.cookies?.axon_session || req.header("Authorization");
  if (!token) return res.status(401).send("Access Denied");
  try {
    const bearerToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    if (bearerToken == null) {
      return res.status(401).json({ message: "token null" });
    }
    const verified = jwt.verify(bearerToken, process.env.JWT_SECRET);
    if (!verified.role || verified.role !== "admin") {
      return res.status(403).json({ message: "Admin privileges required" });
    }
    req.user = verified;
    next();
  } catch (err) {
    return res.status(400).json({ message: "Invalid token" });
  }
};
