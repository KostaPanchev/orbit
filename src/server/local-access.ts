import { DomainError } from "../domain/model";

export function assertLocalRequest(headers: Pick<Headers, "get">, mutation = false) {
  const host = headers.get("host");
  if (!host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new DomainError("Loopback access only.", 403);
  const origin = headers.get("origin");
  if (origin && origin !== `http://${host}`) throw new DomainError("Same-origin access only.", 403);
  if (headers.get("sec-fetch-site") === "cross-site" && headers.get("sec-fetch-dest") !== "document") {
    throw new DomainError("Cross-site data access is disabled.", 403);
  }
  if (mutation && (origin !== `http://${host}` || !headers.get("content-type")?.startsWith("application/json"))) {
    throw new DomainError("Same-origin JSON requests are required.", 403);
  }
}
