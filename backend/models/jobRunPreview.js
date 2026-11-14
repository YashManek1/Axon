import mongoose from "mongoose";

const immutableMixed = { type: mongoose.Schema.Types.Mixed, required: true, immutable: true };

const JobRunPreviewSchema = new mongoose.Schema(
  {
    previewId: { type: String, required: true, immutable: true },
    previewVersion: { type: Number, required: true, immutable: true },
    previewHash: { type: String, required: true, immutable: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    preview: immutableMixed,
    material: immutableMixed,
  },
  { versionKey: false, strict: "throw" },
);

JobRunPreviewSchema.index({ previewId: 1 }, { unique: true, name: "unique_preview_id" });
JobRunPreviewSchema.index(
  { orgId: 1, actorId: 1, jobId: 1, previewId: 1 },
  { name: "scoped_preview_lookup" },
);
JobRunPreviewSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "expired_preview_cleanup" },
);

JobRunPreviewSchema.pre("save", function rejectPreviewRewrite() {
  if (!this.isNew) throw new Error("JobRunPreview records are immutable");
});

JobRunPreviewSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
  ],
  function rejectPreviewMutation() {
    throw new Error("JobRunPreview records are immutable");
  },
);

export default mongoose.model("JobRunPreview", JobRunPreviewSchema);
