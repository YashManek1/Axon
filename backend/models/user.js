import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, select: false },
  role: {
    type: String,
    // "user" kept for backward compat with existing documents/JWTs; maps to "operator" in authResource
    enum: ["admin", "operator", "viewer", "user"],
    default: "operator",
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", UserSchema);
