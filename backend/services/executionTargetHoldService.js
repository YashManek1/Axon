import ExecutionTargetHold from "../models/executionTargetHold.js";

const CONCLUSIVE_OUTCOMES = new Set(["COMPLETED", "REJECTED", "TIMED_OUT", "CANCELLED"]);

function ownerFilter({ organizationId, targetAgentId, runId, attemptId, fencingToken }) {
  return { organizationId, targetAgentId, runId, attemptId, fencingToken };
}

async function assertUniqueTargetIndexReady() {
  await ExecutionTargetHold.init();
  const indexes = await ExecutionTargetHold.collection.indexes();
  const ready = indexes.some((index) =>
    index.name === "execution_target_owner" &&
    index.unique === true &&
    index.key?.organizationId === 1 &&
    index.key?.targetAgentId === 1 &&
    Object.keys(index.key).length === 2 &&
    index.sparse !== true &&
    index.partialFilterExpression === undefined,
  );
  if (!ready) {
    throw new Error("Execution target unique index is not ready");
  }
}

export async function acquireExecutionTargetHold(owner) {
  // An unindexed create can admit two owners during startup or migration.
  await assertUniqueTargetIndexReady();
  try {
    await ExecutionTargetHold.create(ownerFilter(owner));
    return { acquired: true };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const currentOwner = await ExecutionTargetHold.findOne({
      organizationId: owner.organizationId,
      targetAgentId: owner.targetAgentId,
    })
      .select({ _id: 0, runId: 1, attemptId: 1, fencingToken: 1 })
      .lean();

    return { acquired: false, owner: currentOwner };
  }
}

export async function releaseExecutionTargetHold(owner, outcome) {
  if (!CONCLUSIVE_OUTCOMES.has(outcome)) {
    return { released: false, retained: true };
  }

  const result = await ExecutionTargetHold.deleteOne(ownerFilter(owner));
  return { released: result.deletedCount === 1 };
}
