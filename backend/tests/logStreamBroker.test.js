import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Job from "../models/job.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";

let redisConnection;
let logStreamBroker;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  redisConnection = new Redis();

  vi.doMock("../config/queue.js", () => ({
    redisConnection,
  }));

  logStreamBroker = await import("../services/logStreamBroker.js");
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await redisConnection.flushall();
  logStreamBroker.configureLogStreamBroker({
    in: vi.fn(() => ({
      fetchSockets: vi.fn(async () => []),
    })),
  });
});

async function createJobFixture() {
  const unique = `${Date.now()}-${Math.random()}`;
  const org = await Organization.create({
    name: `Org ${unique}`,
    description: "Test organization",
  });
  const user = await User.create({
    username: `user-${unique}`,
    email: `user-${unique}@example.com`,
    password: "hashed-password",
    orgId: org._id,
  });
  const job = await Job.create({
    userId: user._id,
    orgId: org._id,
    name: `Job ${unique}`,
    type: "shell",
    schedule: "* * * * *",
    payload: { command: "echo hello" },
  });

  return { org, user, job };
}

function createSocket(orgId) {
  return {
    data: { orgId: String(orgId) },
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    emit: vi.fn(),
  };
}

describe("logStreamBroker", () => {
  it("publishLogChunk stores the chunk in Redis", async () => {
    await logStreamBroker.publishLogChunk("job-1", "org-1", {
      stream: "stdout",
      line: "hello",
      timestampMs: 1,
    });

    const stored = await redisConnection.lrange("log:stream:job-1", 0, -1);

    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0])).toMatchObject({
      jobId: "job-1",
      orgId: "org-1",
      stream: "stdout",
      line: "hello",
      timestampMs: 1,
    });
  });

  it("publishLogChunk trims the list to 1000 items after 1001 chunks", async () => {
    await Promise.all(
      Array.from({ length: 1001 }, (_, index) =>
        logStreamBroker.publishLogChunk("job-1", "org-1", {
          stream: "stdout",
          line: `line-${index}`,
          timestampMs: index,
        }),
      ),
    );

    await expect(redisConnection.llen("log:stream:job-1")).resolves.toBe(1000);
  });

  it("getRecentLogs returns items in chronological order", async () => {
    await logStreamBroker.publishLogChunk("job-1", "org-1", {
      stream: "stdout",
      line: "first",
      timestampMs: 1,
    });
    await logStreamBroker.publishLogChunk("job-1", "org-1", {
      stream: "stdout",
      line: "second",
      timestampMs: 2,
    });

    const logs = await logStreamBroker.getRecentLogs("job-1");

    expect(logs.map((log) => log.line)).toEqual(["first", "second"]);
  });

  it("getRecentLogs with an empty list returns an empty array", async () => {
    await expect(logStreamBroker.getRecentLogs("missing-job")).resolves.toEqual(
      [],
    );
  });

  it("publishLogChunk emits only to sockets from the matching org", async () => {
    const matchingSocket = createSocket("org-1");
    const otherSocket = createSocket("org-2");

    logStreamBroker.configureLogStreamBroker({
      in: vi.fn(() => ({
        fetchSockets: vi.fn(async () => [matchingSocket, otherSocket]),
      })),
    });

    await logStreamBroker.publishLogChunk("job-1", "org-1", {
      stream: "stderr",
      line: "warning",
      timestampMs: 3,
    });

    expect(matchingSocket.emit).toHaveBeenCalledWith(
      "log_chunk",
      expect.objectContaining({ line: "warning", orgId: "org-1" }),
    );
    expect(otherSocket.emit).not.toHaveBeenCalled();
  });

  it("subscribeClient sends buffered logs to the socket immediately", async () => {
    const { org, job } = await createJobFixture();
    const socket = createSocket(org._id);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "buffered",
      timestampMs: 4,
    });

    await expect(
      logStreamBroker.subscribeClient(socket, job._id, org._id),
    ).resolves.toBe(true);

    expect(socket.join).toHaveBeenCalledWith(`job:${job._id}`);
    expect(socket.emit).toHaveBeenCalledWith("log_catchup", {
      jobId: String(job._id),
      logs: [expect.objectContaining({ line: "buffered" })],
    });
  });

  it("subscribeClient refuses subscription if jobId does not belong to orgId", async () => {
    const { job } = await createJobFixture();
    const otherOrg = await Organization.create({
      name: `Other Org ${Date.now()}-${Math.random()}`,
      description: "Other organization",
    });
    const socket = createSocket(otherOrg._id);

    await expect(
      logStreamBroker.subscribeClient(socket, job._id, otherOrg._id),
    ).resolves.toBe(false);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
