import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCUMENT_UPLOAD_SERVER_MAX_BYTES } from "../constants/documentUpload";
import { LEASE_TEMPLATE_FILE_MAX_BYTES } from "../constants/leaseTemplateUpload";
import { REQUEST_BODY_MAX_BYTES } from "../constants/requestBodyLimit";

/** Units as go-humanize (which Caddy uses for ``max_size``) reads them: ``MB`` is decimal, ``MiB`` binary. */
const HUMANIZE_UNITS: Readonly<Record<string, number>> = {
  b: 1,
  kb: 1000,
  mb: 1000 ** 2,
  gb: 1000 ** 3,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
};

function caddyMaxSizeBytes(caddyfile: string): number {
  const match = /^\s*max_size\s+(\d+)\s*([a-z]+)\s*$/im.exec(caddyfile);
  if (!match) throw new Error("no request_body max_size in the Caddyfile");
  const unit = HUMANIZE_UNITS[match[2].toLowerCase()];
  if (unit === undefined) throw new Error(`unknown size unit ${match[2]}`);
  return Number(match[1]) * unit;
}

function backendConfigBytes(field: string): number {
  const config = readFileSync(resolve(__dirname, "../../../backend/app/core/config.py"), "utf8");
  const match = new RegExp(`^\\s*${field}: int = ([\\d\\s*]+?)\\s*(#|$)`, "m").exec(config);
  if (!match) throw new Error(`no ${field} in core/config.py`);
  return match[1].split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
}

describe("the request body ceiling", () => {
  it("is exactly the bytes Caddy's max_size allows, counted in decimal MB", () => {
    const caddyfile = readFileSync(resolve(__dirname, "../../../docker/Caddyfile.docker"), "utf8");
    expect(REQUEST_BODY_MAX_BYTES).toBe(caddyMaxSizeBytes(caddyfile));
  });

  it("reads MB the way Caddy does", () => {
    expect(caddyMaxSizeBytes("max_size 30MB")).toBe(30_000_000);
    expect(caddyMaxSizeBytes("max_size 30MiB")).toBe(30 * 1024 * 1024);
  });
});

describe("the backend's own limits", () => {
  it("mirror max_upload_size_bytes in binary MiB", () => {
    expect(DOCUMENT_UPLOAD_SERVER_MAX_BYTES).toBe(backendConfigBytes("max_upload_size_bytes"));
  });

  it("mirror max_blackout_attachment_size_bytes in binary MiB", () => {
    expect(LEASE_TEMPLATE_FILE_MAX_BYTES).toBe(backendConfigBytes("max_blackout_attachment_size_bytes"));
  });
});
