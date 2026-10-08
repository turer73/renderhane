import { NextRequest } from "next/server";
import { submitModelLabProbe } from "./submit-handler";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  return submitModelLabProbe(request);
}
