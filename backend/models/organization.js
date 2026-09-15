import mongoose from "mongoose";

const apiKeySchema = new mongoose.Schema(
  {
    keyId: { type: String, required: true, trim: true },
    hash: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    lastUsedAt: { type: Date, required: false },
    revokedAt: { type: Date, required: false },
  },
  { _id: false },
);

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true, trim: true },
  apiKeys: { type: [apiKeySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// keyId must be unique across all organisations so a presented key resolves to
// exactly one org. It CANNOT be declared `unique` on the subdocument: an empty
// apiKeys array indexes as null in a multikey index, so the second org with no
// keys collides with the first (E11000 on apiKeys.keyId: null) and signup 500s.
// A partial index applies the constraint only to real string values.
organizationSchema.index(
  { "apiKeys.keyId": 1 },
  {
    unique: true,
    partialFilterExpression: { "apiKeys.keyId": { $type: "string" } },
  },
);

export default mongoose.model("Organization", organizationSchema);
