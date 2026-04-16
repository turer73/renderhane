import { MODELS, TOOL_MODELS, type ToolType } from "./models";

/* ═══════════════════════════════════════════════
   fal.ai Model Scanner
   Periodically checks our model endpoints + discovers new models
   ═══════════════════════════════════════════════ */

export interface EndpointCheck {
  modelKey: string;
  endpoint: string;
  displayName: string;
  status: "active" | "error" | "unknown";
  responseTimeMs?: number;
  error?: string;
}

export interface NewModelFound {
  name: string;
  endpoint: string;
  category: string;
  source: string;
}

export interface ScanAlert {
  type: "endpoint_down" | "new_model" | "version_upgrade" | "price_change";
  severity: "critical" | "warning" | "info";
  endpoint: string;
  message: string;
  detail?: string;
}

export interface ScanResult {
  scannedAt: string;
  totalModelsChecked: number;
  activeCount: number;
  errorCount: number;
  newModelsFound: number;
  endpointChecks: EndpointCheck[];
  newModels: NewModelFound[];
  alerts: ScanAlert[];
}

/** Categories to scan on fal.ai for new models */
const SCAN_CATEGORIES = [
  { url: "https://fal.ai/models?category=3d", category: "3D Model" },
  { url: "https://fal.ai/models?category=image", category: "Image" },
  { url: "https://fal.ai/models?category=video", category: "Video" },
];

/** Known fal.ai model page URL patterns for endpoint extraction */
const FAL_MODEL_URL_PATTERN = /fal\.ai\/models\/([\w-]+(?:\/[\w.-]+)*)/g;

/**
 * Check if a fal.ai model endpoint is reachable.
 * Uses a lightweight HEAD-style request to the model's API page.
 */
async function checkEndpoint(modelKey: string): Promise<EndpointCheck> {
  const model = MODELS[modelKey];
  if (!model) {
    return {
      modelKey,
      endpoint: "unknown",
      displayName: modelKey,
      status: "error",
      error: "Model key not found in MODELS config",
    };
  }

  const apiUrl = `https://fal.ai/models/${model.id}/api`;
  const start = Date.now();

  try {
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { "User-Agent": "Renderhane-Scanner/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    const elapsed = Date.now() - start;

    if (res.ok || res.status === 200) {
      return {
        modelKey,
        endpoint: model.id,
        displayName: model.displayName.en,
        status: "active",
        responseTimeMs: elapsed,
      };
    }

    // 404 = endpoint removed or renamed
    if (res.status === 404) {
      return {
        modelKey,
        endpoint: model.id,
        displayName: model.displayName.en,
        status: "error",
        responseTimeMs: elapsed,
        error: `HTTP 404 — endpoint may be deprecated or renamed`,
      };
    }

    return {
      modelKey,
      endpoint: model.id,
      displayName: model.displayName.en,
      status: "active",
      responseTimeMs: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      modelKey,
      endpoint: model.id,
      displayName: model.displayName.en,
      status: "error",
      responseTimeMs: elapsed,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

/**
 * Scan a fal.ai category page for model endpoints.
 * Returns endpoint IDs found on the page.
 */
async function scanCategoryPage(
  url: string,
  category: string
): Promise<NewModelFound[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Renderhane-Scanner/1.0" },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return [];

    const html = await res.text();

    // Extract model endpoint paths from links
    const found: NewModelFound[] = [];
    const knownEndpoints = new Set(Object.values(MODELS).map((m) => m.id));

    // Match href patterns like /models/fal-ai/trellis/multi
    const hrefPattern = /href="\/models\/([\w-]+(?:\/[\w.+-]+)*?)(?:\/api)?"/g;
    let match;
    while ((match = hrefPattern.exec(html)) !== null) {
      const endpoint = match[1];

      // Skip if we already have this endpoint
      if (knownEndpoints.has(endpoint)) continue;

      // Skip duplicate finds within this scan
      if (found.some((f) => f.endpoint === endpoint)) continue;

      // Extract a display name from the endpoint path
      const name = endpoint
        .split("/")
        .pop()
        ?.replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) ?? endpoint;

      found.push({
        name,
        endpoint,
        category,
        source: url,
      });
    }

    return found;
  } catch {
    return [];
  }
}

/**
 * Generate alerts from endpoint checks and new model discoveries.
 */
function generateAlerts(
  checks: EndpointCheck[],
  newModels: NewModelFound[]
): ScanAlert[] {
  const alerts: ScanAlert[] = [];

  // Alert for failed endpoints
  for (const check of checks) {
    if (check.status === "error") {
      alerts.push({
        type: "endpoint_down",
        severity: "critical",
        endpoint: check.endpoint,
        message: `${check.displayName} (${check.endpoint}) ulasilamadi`,
        detail: check.error,
      });
    }
  }

  // Alert for slow endpoints (> 10s response)
  for (const check of checks) {
    if (check.status === "active" && check.responseTimeMs && check.responseTimeMs > 10000) {
      alerts.push({
        type: "endpoint_down",
        severity: "warning",
        endpoint: check.endpoint,
        message: `${check.displayName} yavas yanit: ${check.responseTimeMs}ms`,
      });
    }
  }

  // Alert for new models found
  for (const model of newModels) {
    alerts.push({
      type: "new_model",
      severity: "info",
      endpoint: model.endpoint,
      message: `Yeni model: ${model.name} (${model.category})`,
      detail: `Endpoint: ${model.endpoint}`,
    });
  }

  return alerts;
}

/**
 * Run a full fal.ai model scan.
 * 1. Check all our configured endpoints
 * 2. Scan fal.ai category pages for new models
 * 3. Generate alerts
 */
export async function runScan(): Promise<ScanResult> {
  // 1. Collect all unique model keys from TOOL_MODELS
  const allModelKeys = new Set<string>();
  for (const models of Object.values(TOOL_MODELS)) {
    for (const key of models) {
      allModelKeys.add(key);
    }
  }

  // 2. Check all endpoints in parallel (batched to avoid rate limits)
  const keys = Array.from(allModelKeys);
  const BATCH_SIZE = 5;
  const checks: EndpointCheck[] = [];

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(checkEndpoint));
    checks.push(...results);
  }

  // 3. Scan category pages for new models
  const newModelsPromises = SCAN_CATEGORIES.map((cat) =>
    scanCategoryPage(cat.url, cat.category)
  );
  const newModelsArrays = await Promise.all(newModelsPromises);
  const newModels = newModelsArrays.flat();

  // 4. Generate alerts
  const alerts = generateAlerts(checks, newModels);

  const activeCount = checks.filter((c) => c.status === "active").length;
  const errorCount = checks.filter((c) => c.status === "error").length;

  return {
    scannedAt: new Date().toISOString(),
    totalModelsChecked: checks.length,
    activeCount,
    errorCount,
    newModelsFound: newModels.length,
    endpointChecks: checks,
    newModels,
    alerts,
  };
}
