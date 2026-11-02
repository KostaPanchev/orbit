import { ZodError } from "zod";
import { DomainError, mutationSchema } from "@/domain/model";
import { activeDataset, getDatabase } from "@/server/db/client";
import { getSnapshot, mutate } from "@/server/services/organizer";
import { assertLocalRequest } from "@/server/local-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof DomainError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: "Invalid request. Check the event fields and try again." }, { status: 400, headers });
  console.error("Organizer request failed:", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ error: "Local storage is unavailable. Check the Orbit terminal and database setup." }, { status: 500, headers });
}
export async function GET(request: Request) {
  try {
    assertLocalRequest(request.headers);
    return Response.json(getSnapshot(getDatabase(), activeDataset()), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertLocalRequest(request.headers, true);
    const action = mutationSchema.parse(await request.json());
    return Response.json(mutate(getDatabase(), activeDataset(), action), { headers });
  } catch (error) { return failure(error); }
}
