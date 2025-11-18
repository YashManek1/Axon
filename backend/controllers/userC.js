import userModel from "../models/user.js";
import orgModel from "../models/organization.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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

    // Remove password before sending user object
    const safeUser = { ...newUser._doc };
    delete safeUser.password;

    const token = jwt.sign(
      {
        id: newUser._id,
        orgId: org._id,
        username: newUser.username,
        role: newUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error("Error registering user:", error);
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

    // Remove password before sending user object
    const safeUser = { ...user._doc };
    delete safeUser.password;

    const token = jwt.sign(
      {
        id: user._id,
        orgId: user.orgId,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
