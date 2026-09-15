import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionToken } from "../controllers/userC.js";
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
  await redisConnection.flushdb();
  logStreamBroker.configureLogStreamBroker({
    in: vi.fn(() => ({
      fetchSockets: vi.fn(async () => []),
    })),
  });
});

async function createOrganization(label = "Org") {
  const unique = `${Date.now()}-${Math.random()}`;
  return Organization.create({
    name: `${label} ${unique}`,
    description: "Test organization",
  });
}

async function createUser(orgId, role = "operator", label = "user") {
  const unique = `${Date.now()}-${Math.random()}`;
  return User.create({
    username: `${label}-${unique}`,
    email: `${label}-${unique}@example.com`,
    password: "hashed-password",
    role,
    orgId,
  });
}

async function createJob(user, permissions = {}) {
  const unique = `${Date.now()}-${Math.random()}`;
  return Job.create({
    userId: user._id,
    orgId: user.orgId,
    name: `Job ${unique}`,
    type: "shell",
    schedule: "* * * * *",
    payload: { command: "echo hello" },
    permissions,
  });
}

async function createJobFixture({ role = "operator", permissions = {} } = {}) {
  const org = await createOrganization();
  const user = await createUser(org._id, role);
  const job = await createJob(user, permissions);
  return { org, user, job };
}

function createSocket(user, options = {}) {
  return {
    clientType: options.clientType ?? "ui",
    data: {
      orgId: String(user.orgId),
      sessionToken: options.sessionToken ?? signSessionToken(user),
    },
    user,
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function signExpiredSessionToken(user) {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() - 2 * 60 * 60 * 1000);
  const token = signSessionToken(user);
  vi.useRealTimers();
  return token;
}

function useSockets(...sockets) {
  const fetchSockets = vi.fn(async () => sockets);
  const inRoom = vi.fn(() => ({ fetchSockets }));
  logStreamBroker.configureLogStreamBroker({ in: inRoom });
  return { fetchSockets, inRoom };
}

async function subscribe(socket, job) {
  return logStreamBroker.subscribeClient(socket, job._id, socket.user);
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
    expect(JSON.parse(stored[0])).toEqual({
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

  it("publishLogChunk emits the exact chunk only to a currently authorized org member", async () => {
    const { org, user, job } = await createJobFixture();
    const otherOrg = await createOrganization("Other Org");
    const otherUser = await createUser(otherOrg._id);
    const matchingSocket = createSocket(user);
    const otherSocket = createSocket(otherUser);
    const { fetchSockets, inRoom } = useSockets(matchingSocket, otherSocket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stderr",
      line: "warning",
      timestampMs: 3,
    });

    expect(inRoom).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);
    expect(fetchSockets).toHaveBeenCalledOnce();
    expect(matchingSocket.emit).toHaveBeenCalledExactlyOnceWith("log_chunk", {
      jobId: String(job._id),
      orgId: String(org._id),
      stream: "stderr",
      line: "warning",
      timestampMs: 3,
    });
    expect(matchingSocket.leave).not.toHaveBeenCalled();
    expect(otherSocket.emit).not.toHaveBeenCalled();
    expect(otherSocket.leave).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);
  });

  it("subscribeClient sends buffered logs to an authenticated UI socket", async () => {
    const { org, user, job } = await createJobFixture();
    const socket = createSocket(user);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "buffered",
      timestampMs: 4,
    });

    await expect(subscribe(socket, job)).resolves.toBe(true);

    expect(socket.join).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith("log_catchup", {
      jobId: String(job._id),
      logs: [
        {
          jobId: String(job._id),
          orgId: String(org._id),
          stream: "stdout",
          line: "buffered",
          timestampMs: 4,
        },
      ],
    });
  });

  it("subscribeClient rejects machine sockets", async () => {
    const { user, job } = await createJobFixture();
    const socket = createSocket(user, { clientType: "agent" });

    await expect(subscribe(socket, job)).resolves.toBe(false);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("publishLogChunk ignores machine sockets in the room", async () => {
    const { org, user, job } = await createJobFixture();
    const socket = createSocket(user, { clientType: "agent" });
    useSockets(socket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "secret",
      timestampMs: 5,
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.leave).not.toHaveBeenCalled();
  });

  it("uses the current database role for existing and fresh subscriptions", async () => {
    const { org, user, job } = await createJobFixture({
      role: "viewer",
      permissions: { allowedRoles: ["viewer"] },
    });
    const existingSocket = createSocket(user);
    await expect(subscribe(existingSocket, job)).resolves.toBe(true);
    existingSocket.emit.mockClear();
    await User.updateOne({ _id: user._id }, { role: "operator" });
    useSockets(existingSocket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "after role change",
      timestampMs: 6,
    });

    expect(existingSocket.emit).not.toHaveBeenCalled();
    expect(existingSocket.leave).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);

    const freshSocket = createSocket(user);
    await expect(subscribe(freshSocket, job)).resolves.toBe(false);
    expect(freshSocket.join).not.toHaveBeenCalled();
    expect(freshSocket.emit).not.toHaveBeenCalled();
  });

  it("uses the current job allowlist for existing and fresh subscriptions", async () => {
    const { org, user, job } = await createJobFixture();
    const otherUser = await createUser(org._id);
    const existingSocket = createSocket(user);
    await expect(subscribe(existingSocket, job)).resolves.toBe(true);
    existingSocket.emit.mockClear();
    await Job.updateOne(
      { _id: job._id },
      {
        permissions: {
          allowedUsers: [otherUser._id],
          allowedRoles: [],
        },
      },
    );
    useSockets(existingSocket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "after allowlist change",
      timestampMs: 7,
    });

    expect(existingSocket.emit).not.toHaveBeenCalled();
    expect(existingSocket.leave).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);

    const freshSocket = createSocket(user);
    await expect(subscribe(freshSocket, job)).resolves.toBe(false);
    expect(freshSocket.join).not.toHaveBeenCalled();
    expect(freshSocket.emit).not.toHaveBeenCalled();
  });

  it("invalidates existing and fresh subscriptions after the member is removed", async () => {
    const { org, user, job } = await createJobFixture();
    const existingSocket = createSocket(user);
    await expect(subscribe(existingSocket, job)).resolves.toBe(true);
    existingSocket.emit.mockClear();
    await User.deleteOne({ _id: user._id });
    useSockets(existingSocket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "after removal",
      timestampMs: 8,
    });

    expect(existingSocket.leave).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);
    expect(existingSocket.emit).toHaveBeenCalledExactlyOnceWith(
      "log_subscription_error",
      { error: "SESSION_INVALID", jobId: String(job._id) },
    );
    expect(existingSocket.disconnect).toHaveBeenCalledExactlyOnceWith(true);

    const freshSocket = createSocket(user);
    await expect(subscribe(freshSocket, job)).rejects.toThrow(
      "Session membership is no longer valid",
    );
    expect(freshSocket.join).not.toHaveBeenCalled();
  });

  it("invalidates existing and fresh subscriptions after the member changes org", async () => {
    const { org, user, job } = await createJobFixture();
    const existingSocket = createSocket(user);
    await expect(subscribe(existingSocket, job)).resolves.toBe(true);
    existingSocket.emit.mockClear();
    const otherOrg = await createOrganization("New Org");
    await User.updateOne({ _id: user._id }, { orgId: otherOrg._id });
    useSockets(existingSocket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "after org change",
      timestampMs: 9,
    });

    expect(existingSocket.leave).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);
    expect(existingSocket.emit).toHaveBeenCalledExactlyOnceWith(
      "log_subscription_error",
      { error: "SESSION_INVALID", jobId: String(job._id) },
    );
    expect(existingSocket.disconnect).toHaveBeenCalledExactlyOnceWith(true);

    const freshSocket = createSocket(user);
    await expect(subscribe(freshSocket, job)).rejects.toThrow(
      "Session membership is no longer valid",
    );
    expect(freshSocket.join).not.toHaveBeenCalled();
  });

  it("invalidates existing and fresh subscriptions when the session expires", async () => {
    const { org, user, job } = await createJobFixture();
    const expiredToken = signExpiredSessionToken(user);
    const existingSocket = createSocket(user);
    await expect(subscribe(existingSocket, job)).resolves.toBe(true);
    existingSocket.emit.mockClear();
    existingSocket.data.sessionToken = expiredToken;
    useSockets(existingSocket);

    await logStreamBroker.publishLogChunk(job._id, org._id, {
      stream: "stdout",
      line: "after expiry",
      timestampMs: 10,
    });

    expect(existingSocket.leave).toHaveBeenCalledExactlyOnceWith(`job:${job._id}`);
    expect(existingSocket.emit).toHaveBeenCalledExactlyOnceWith(
      "log_subscription_error",
      { error: "SESSION_INVALID", jobId: String(job._id) },
    );
    expect(existingSocket.disconnect).toHaveBeenCalledExactlyOnceWith(true);

    const freshSocket = createSocket(user, { sessionToken: expiredToken });
    await expect(subscribe(freshSocket, job)).rejects.toThrow("jwt expired");
    expect(freshSocket.join).not.toHaveBeenCalled();
  });
});
