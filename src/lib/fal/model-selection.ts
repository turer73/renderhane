import { MODELS, TOOL_MODELS, type ToolType } from "./models";

export class ModelSelectionError extends Error {
  constructor() {
    super("Model is not available for this tool");
    this.name = "ModelSelectionError";
  }
}

/** Public tools cannot borrow another tool's model or free-credit eligibility.
 * The separately authorized admin laboratory does not use this public router.
 */
export function assertModelForTool(tool: string, modelKey: unknown): void {
  if (modelKey === undefined) return;
  if (
    typeof modelKey !== "string" ||
    !Object.hasOwn(MODELS, modelKey) ||
    !Object.hasOwn(TOOL_MODELS, tool) ||
    !TOOL_MODELS[tool as ToolType].includes(modelKey)
  ) throw new ModelSelectionError();
}
