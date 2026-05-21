import http from "http";

const port = process.env.PORT || "3000";

const req = http.get(
  {
    hostname: "127.0.0.1",
    port,
    path: "/admin/health",
    timeout: 3000,
  },
  (res) => {
    res.resume();
    process.exit(res.statusCode && res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
  },
);

req.on("timeout", () => {
  req.destroy();
  process.exit(1);
});

req.on("error", () => {
  process.exit(1);
});
