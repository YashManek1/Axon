import { describe, it, expect } from "vitest";
import { buildSinkPayload } from "../utils/sinkFormat.js";

describe("buildSinkPayload", () => {
  // ── JSON ──────────────────────────────────────────────────────────────────

  it("defaults to JSON when exportFormats is empty", async () => {
    const data = { exitCode: 0, stdout: "hello" };
    const result = await buildSinkPayload(data, []);
    expect(result).toEqual({ json: data });
  });

  it("returns JSON passthrough without serialisation", async () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = await buildSinkPayload(data, ["JSON"]);
    expect(result.json).toBe(data); // same reference — no copy
  });

  // ── CSV ───────────────────────────────────────────────────────────────────

  it("serialises a flat object to CSV with header row", async () => {
    const data = { name: "test", value: 42 };
    const result = await buildSinkPayload(data, ["CSV"]);
    expect(result.csv).toContain("name,value");
    expect(result.csv).toContain("test,42");
  });

  it("serialises an array of objects to CSV", async () => {
    const data = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ];
    const result = await buildSinkPayload(data, ["CSV"]);
    const lines = result.csv.split("\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe("1,2");
    expect(lines[2]).toBe("3,4");
  });

  it("CSV-escapes values containing commas", async () => {
    const data = { label: "hello, world", count: 1 };
    const result = await buildSinkPayload(data, ["CSV"]);
    expect(result.csv).toContain('"hello, world"');
  });

  it("CSV-flattens nested objects with dot-notation keys", async () => {
    const data = { user: { name: "Alice", age: 30 } };
    const result = await buildSinkPayload(data, ["CSV"]);
    expect(result.csv).toContain("user.name");
    expect(result.csv).toContain("Alice");
  });

  it("handles null/undefined data gracefully in CSV", async () => {
    const result = await buildSinkPayload(null, ["CSV"]);
    expect(result.csv).toBe("");
  });

  // ── Excel ─────────────────────────────────────────────────────────────────

  it("produces a non-empty base64 string for Excel format", async () => {
    const data = { col1: "foo", col2: "bar" };
    const result = await buildSinkPayload(data, ["Excel"]);
    expect(typeof result.xlsxBase64).toBe("string");
    expect(result.xlsxBase64.length).toBeGreaterThan(0);
    expect(() => Buffer.from(result.xlsxBase64, "base64")).not.toThrow();
  });

  it("Excel output starts with PK (XLSX magic bytes) when decoded", async () => {
    const data = [{ x: 1 }, { x: 2 }];
    const result = await buildSinkPayload(data, ["Excel"]);
    const decoded = Buffer.from(result.xlsxBase64, "base64");
    // XLSX is a ZIP: starts with PK\x03\x04
    expect(decoded[0]).toBe(0x50); // P
    expect(decoded[1]).toBe(0x4b); // K
  });

  it("Excel handles empty data array", async () => {
    const result = await buildSinkPayload([], ["Excel"]);
    expect(result.xlsxBase64.length).toBeGreaterThan(0);
  });

  // ── Multiple formats ──────────────────────────────────────────────────────

  it("produces all three formats when all are requested", async () => {
    const data = { key: "value" };
    const result = await buildSinkPayload(data, ["JSON", "CSV", "Excel"]);
    expect(result).toHaveProperty("json");
    expect(result).toHaveProperty("csv");
    expect(result).toHaveProperty("xlsxBase64");
  });

  it("produces only requested formats", async () => {
    const data = { a: 1 };
    const result = await buildSinkPayload(data, ["CSV"]);
    expect(result).not.toHaveProperty("json");
    expect(result).not.toHaveProperty("xlsxBase64");
    expect(result).toHaveProperty("csv");
  });
});
