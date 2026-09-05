import { proxyWorkshop } from "@/lib/relief/workshop-server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return proxyWorkshop(request, (await context.params).path ?? []);
}
export async function POST(request: Request, context: Context) {
  return proxyWorkshop(request, (await context.params).path ?? []);
}
