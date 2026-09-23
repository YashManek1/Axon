FROM rust:1.86-alpine AS builder

WORKDIR /app
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig

COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN cargo build --release --locked

COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

FROM builder AS test
RUN apk add --no-cache docker-cli
RUN rustup component add clippy
RUN cargo test --locked
RUN cargo clippy --locked --all-targets -- -D warnings

FROM alpine:3.19 AS runtime

RUN apk add --no-cache ca-certificates docker-cli libgcc openssl \
  && addgroup -g 1001 axon \
  && adduser -D -u 1001 -G axon axon \
  && mkdir -p /var/lib/axon/journal \
  && chown -R axon:axon /var/lib/axon

WORKDIR /app
COPY --from=builder /app/target/release/agent /usr/local/bin/axon-agent

ENV AXON_AGENT_JOURNAL_DIR=/var/lib/axon/journal

USER axon
ENTRYPOINT ["axon-agent"]
