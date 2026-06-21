/**
 * Serializes job output into the formats requested by the sink configuration.
 *
 * Returns an object stored as the `formats` field inside the sink Mongo document:
 *   { json?: unknown, csv?: string, xlsxBase64?: string }
 *
 * If exportFormats is empty the default is ["JSON"] (backwards-compatible with
 * the previous raw-insertOne behaviour).
 *
 * @param {unknown} data - The raw job output (HTTP response body or shell result).
 * @param {string[]} [exportFormats=[]] - Formats requested, e.g. ["CSV","Excel"].
 * @returns {Promise<Record<string, unknown>>}
 */
export async function buildSinkPayload(data, exportFormats = []) {
  const formats = exportFormats.length > 0 ? exportFormats : ["JSON"];
  const result = {};

  for (const fmt of formats) {
    if (fmt === "JSON") {
      result.json = data;
    } else if (fmt === "CSV") {
      result.csv = toCsv(data);
    } else if (fmt === "Excel") {
      result.xlsxBase64 = await toExcelBase64(data);
    }
  }

  return result;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function toCsv(data) {
  if (data === null || data === undefined) return "";
  if (typeof data !== "object") return String(data);

  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return "";

  const flatRows = rows.map((row) => flattenObject(row));
  const headers = [...new Set(flatRows.flatMap((r) => Object.keys(r)))];

  const lines = [
    headers.map(csvEscape).join(","),
    ...flatRows.map((row) =>
      headers.map((h) => csvEscape(row[h] ?? "")).join(","),
    ),
  ];

  return lines.join("\n");
}

/**
 * Recursively flattens a nested object into dot-notation keys.
 * Arrays are JSON-stringified rather than further expanded.
 */
function flattenObject(obj, prefix = "", result = {}) {
  if (obj === null || typeof obj !== "object") {
    result[prefix || "value"] = obj;
    return result;
  }
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, newKey, result);
    } else {
      result[newKey] = Array.isArray(value) ? JSON.stringify(value) : value;
    }
  }
  return result;
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Excel ───────────────────────────────────────────────────────────────────

async function toExcelBase64(data) {
  // Dynamic import so the module can be loaded even when exceljs is absent
  // (e.g. in environments where the optional dep wasn't installed).
  let ExcelJS;
  try {
    ({ default: ExcelJS } = await import("exceljs"));
  } catch {
    throw new Error(
      "exceljs is required for Excel export. Run: npm install exceljs",
    );
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("output");

  const rows = Array.isArray(data)
    ? data
    : data !== null && data !== undefined
      ? [data]
      : [];

  if (rows.length === 0) {
    sheet.addRow(["(empty)"]);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  const flatRows = rows.map((r) =>
    typeof r === "object" && r !== null ? flattenObject(r) : { value: r },
  );
  const headers = [...new Set(flatRows.flatMap((r) => Object.keys(r)))];

  // Header row (bold)
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };

  // Data rows
  for (const row of flatRows) {
    sheet.addRow(headers.map((h) => row[h] ?? ""));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
