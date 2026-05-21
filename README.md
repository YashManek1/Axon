# Axon

Distributed orchestration platform for remote execution, workflow scheduling, and scalable task processing.

Axon is a multi-tenant distributed execution system built using Node.js, Redis, BullMQ, WebSockets, and Rust agents. It enables organizations to schedule, orchestrate, and execute jobs across remote machines with real-time telemetry, fault tolerance, and scalable infrastructure.

---

# Features

## Distributed Scheduling Engine

* Redis-backed persistent scheduling using BullMQ
* Immediate and recurring job execution
* Retry logic with exponential backoff
* Fault-tolerant queue architecture
* Background worker processing

## Remote Execution via Rust Agents

* Lightweight Rust agents installed on remote systems
* Secure WebSocket-based communication
* Remote shell command execution
* Real-time execution feedback
* Heartbeat & telemetry monitoring

## Multi-Tenant Architecture

* Organization-scoped infrastructure
* Shared agent pools across teams
* Data isolation between organizations
* Role-aware workflow execution

## DAG-Based Workflow Orchestration

* Dependency-aware job execution
* Workflow chaining
* Circular dependency prevention
* Directed execution pipelines

## Real-Time Observability

* Live execution logs
* CPU/RAM telemetry
* Agent online/offline tracking
* Job execution history
* System monitoring

## Data Sink Pipelines

* ETL-style execution outputs
* MongoDB sink integrations
* Structured result storage
* External database support

---

# Architecture

## Control Plane

Built using:

* Node.js
* Express.js
* Redis
* BullMQ
* Socket.IO
* MongoDB

Responsible for:

* Queue orchestration
* Job scheduling
* Dependency management
* Agent coordination
* Real-time communication
* Multi-tenant state management

---

## Execution Layer

Rust-based remote execution agents responsible for:

* Command execution
* Heartbeat telemetry
* Log streaming
* Execution feedback
* System monitoring

Agents connect to the control plane via persistent WebSocket connections.

---

# System Design

```text id="c8w12m"
Dashboard/UI
      │
      ▼
Node.js Control Plane
      │
┌───────────────┐
│ Redis/BullMQ │
└───────────────┘
      │
      ▼
 Job Workers
      │
      ▼
Socket.IO Layer
      │
┌───────────────┐
│ Rust Agents  │
└───────────────┘
      │
      ▼
Remote Machine Execution
```

---

# Tech Stack

## Backend

* Node.js
* Express.js
* MongoDB
* Redis
* BullMQ
* Socket.IO

## Agent Runtime

* Rust
* Tokio
* rust_socketio
* serde
* sys-info

## Frontend

* React
* TypeScript
* TailwindCSS
* Zustand
* TanStack Query
* Recharts

---

# Current Status

Axon is currently under active development.

Implemented:

* Redis-backed BullMQ scheduling
* Immediate + recurring job queues
* Remote Rust agent execution
* WebSocket communication layer
* Multi-tenant organization model
* Retry & failure handling
* Agent heartbeat system
* Job history tracking
* Remote shell execution pipeline

In Progress:

* Live terminal log streaming
* Advanced analytics dashboard
* Workflow graph visualization
* Agent provisioning improvements
* Real-time telemetry dashboard
* Production security hardening

---

# Local Development Setup

## Prerequisites

* Node.js
* Redis
* MongoDB
* Rust

## Start Redis

```bash id="k3v1e8"
redis-server
```

## Backend

```bash id="r0x4mq"
cd backend
npm install
npm run dev
```

## Frontend

```bash id="m9s2lp"
cd frontend
npm install
npm run dev
```

## Rust Agent

```bash id="f1q7vn"
cd agent
cargo run
```

---

# Deployment

| Component    | Platform          |
| ------------ | ----------------- |
| Frontend     | Render            |
| Backend      | Render            |
| Database     | MongoDB Atlas     |
| Queue System | Self-hosted Redis |

Rust agents are currently run locally during development/testing.

---

# Key Engineering Concepts

* Distributed Systems
* Producer-Consumer Architecture
* Fault-Tolerant Scheduling
* Workflow Orchestration
* Real-Time Communication
* Multi-Tenant Infrastructure
* Remote Process Execution
* Queue-Based Systems
* Horizontal Scalability

---

# Vision

Axon explores scalable distributed orchestration systems for autonomous workflows, remote execution, and AI-native infrastructure.

The long-term goal is to build a flexible execution platform capable of coordinating distributed workloads, developer tooling, and autonomous systems across remote environments.

---

# Author

Yash Manek

Backend & Distributed Systems Engineer focused on:

* AI infrastructure
* Autonomous workflows
* Distributed systems
* Developer tooling
* Agentic architectures
