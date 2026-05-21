FROM rust:1.78-alpine AS builder

WORKDIR /app
RUN apk add --no-cache musl-dev openssl-dev pkgconfig

COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN cargo build --release

COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM alpine:3.19 AS runtime

RUN apk add --no-cache ca-certificates libgcc openssl \
  && addgroup -g 1001 axon \
  && adduser -D -u 1001 -G axon axon

WORKDIR /app
COPY --from=builder /app/target/release/agent /usr/local/bin/axon-agent

USER axon
ENTRYPOINT ["axon-agent"]
