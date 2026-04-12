import { NextResponse } from "next/server";
import { requireAuth } from "./auth";

export async function withAuth<T>(
  handler: () => Promise<T>,
): Promise<T | Response> {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return handler();
}

export function jsonError(status: number, message: string): Response {
  return NextResponse.json({ error: message }, { status });
}
