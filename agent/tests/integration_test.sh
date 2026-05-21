#!/usr/bin/env bash
set -euo pipefail

# Manual integration test for Axon agent async execution and reconnect behavior.
#
# Prerequisites:
# 1. Start the backend and ensure MongoDB/Redis are configured.
# 2. Create or reuse an Agent document and set:
#      SERVER_URL=http://localhost:3001
#      AGENT_ID=<agent document id>
#      AGENT_API_KEY=<plaintext api key>
# 3. Build the agent:
#      cargo build
#
# Steps:
# 1. Start the agent:
#      RUST_LOG=debug cargo run
#    Expected: logs contain "connected to Axon control plane".
#
# 2. Dispatch a long-running shell command from the control plane:
#      sleep 60
#    On Windows, use:
#      ping 127.0.0.1 -n 61 > nul
#    Expected: logs contain "executing command" while the process runs.
#
# 3. Confirm heartbeats continue during execution.
#    Expected: logs contain repeated "heartbeat sent" entries every 5 seconds
#    while the 60-second command is still running.
#
# 4. Confirm command completion.
#    Expected: after roughly 60 seconds, logs contain "command result sent",
#    and the backend receives a command_result event for the job.
#
# 5. Simulate a network/backend outage.
#    Stop the backend for about 30 seconds, then restart it.
#    Expected: agent logs "connection dropped; reconnecting" with increasing
#    delay values, then "connected to Axon control plane" after backend returns.
#
# This script is documentation-only because it requires a live backend and agent
# record. It exits successfully after printing the checklist.
cat <<'EOF'
Manual Axon agent integration test:
- Start backend
- Run: RUST_LOG=debug cargo run
- Verify: "connected to Axon control plane"
- Dispatch: sleep 60
- Verify: heartbeats continue every 5 seconds
- Verify: command_result is sent after command completes
- Stop backend for ~30 seconds, restart it
- Verify: reconnect logs and successful reconnection
EOF
