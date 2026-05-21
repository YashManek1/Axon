function createExecutionError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createJobExecutionRouter(io) {
  async function dispatchCommandToAgent(
    jobId,
    agentId,
    command,
    timeoutMs = 30000,
  ) {
    const socket = io.sockets.sockets.get(agentId);

    if (!socket) {
      throw createExecutionError("AGENT_NOT_CONNECTED");
    }

    return new Promise((resolve, reject) => {
      let timeoutId;
      let settled = false;

      function cleanup() {
        socket.off("command_result", onCommandResult);
        socket.off("disconnect", onDisconnect);
        clearTimeout(timeoutId);
      }

      function settle(callback, value) {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        callback(value);
      }

      function onCommandResult(data) {
        if (data?.jobId !== jobId) {
          return;
        }

        settle(resolve, data);
      }

      function onTimeout() {
        settle(reject, createExecutionError("EXECUTION_TIMEOUT"));
      }

      function onDisconnect() {
        settle(reject, createExecutionError("AGENT_DISCONNECTED"));
      }

      socket.on("command_result", onCommandResult);
      socket.on("disconnect", onDisconnect);
      timeoutId = setTimeout(onTimeout, timeoutMs);

      socket.emit("execute_command", { jobId, command });
    });
  }

  return { dispatchCommandToAgent };
}

let configuredRouter;

export function configureJobExecutionRouter(io) {
  configuredRouter = createJobExecutionRouter(io);
  return configuredRouter;
}

export function dispatchCommandToAgent(
  jobId,
  agentId,
  command,
  timeoutMs = 30000,
) {
  if (!configuredRouter) {
    throw createExecutionError("JOB_EXECUTION_ROUTER_NOT_CONFIGURED");
  }

  return configuredRouter.dispatchCommandToAgent(
    jobId,
    agentId,
    command,
    timeoutMs,
  );
}
