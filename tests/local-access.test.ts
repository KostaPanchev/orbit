// @vitest-environment node
import { expect, it } from "vitest";
import { assertLocalRequest } from "@/server/local-access";

it("allows loopback navigation and same-origin JSON mutations only", () => {
  expect(() => assertLocalRequest(new Headers({ host: "127.0.0.1:3100" }))).not.toThrow();
  expect(() => assertLocalRequest(new Headers({ host: "localhost:3000", "sec-fetch-site": "cross-site", "sec-fetch-dest": "document" }))).not.toThrow();
  expect(() => assertLocalRequest(new Headers({ host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }), true)).not.toThrow();
  const invalidHeaders: Record<string, string>[] = [
    { host: "attacker.invalid:3000" },
    { host: "localhost:3000", origin: "https://attacker.invalid" },
    { host: "localhost:3000", "sec-fetch-site": "cross-site", "sec-fetch-dest": "iframe" },
  ];
  for (const fields of invalidHeaders) expect(() => assertLocalRequest(new Headers(fields))).toThrow();
  expect(() => assertLocalRequest(new Headers({ host: "localhost:3000" }), true)).toThrow();
});
