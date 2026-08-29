import crypto from "crypto";

// ---------------------------------------------------------------------------
// Package definitions
// ---------------------------------------------------------------------------

export const PACKAGES = {
  monthly: { credits: 50, price: 99, name: "Aylık Başlangıç" },
  starter: { credits: 100, price: 199, name: "Starter" },
  standard: { credits: 300, price: 499, name: "Standard" },
  pro: { credits: 800, price: 999, name: "Professional" },
} as const;

export type PackageKey = keyof typeof PACKAGES;

export function isValidPackageKey(key: string): key is PackageKey {
  return key in PACKAGES;
}

// ---------------------------------------------------------------------------
// BasketId HMAC signing / verification
// ---------------------------------------------------------------------------
// The basketId is sent to iyzico and returned in callbacks/webhooks.
// We sign it with HMAC-SHA256 using the iyzico secret key to prevent
// an attacker from forging a different userId or packageKey.
// Format: "userId:packageKey:locale:hmac"

/**
 * Signs a basketId payload (userId:packageKey:locale) with HMAC-SHA256.
 * Returns "userId:packageKey:locale:hmac".
 */
export function signBasketId(
  userId: string,
  packageKey: string,
  locale: string
): string {
  const { secretKey } = getConfig();
  const payload = `${userId}:${packageKey}:${locale}`;
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verifies an HMAC-signed basketId and returns the decoded fields,
 * or null if the signature is invalid.
 */
export function verifyBasketId(
  signedBasketId: string
): { userId: string; packageKey: string; locale: string } | null {
  const parts = (signedBasketId || "").split(":");
  if (parts.length !== 4) return null;

  const [userId, packageKey, locale, receivedHmac] = parts;
  if (!userId || !packageKey || !locale || !receivedHmac) return null;

  const { secretKey } = getConfig();
  const payload = `${userId}:${packageKey}:${locale}`;
  const expectedHmac = crypto
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  try {
    const expected = Buffer.from(expectedHmac, "hex");
    const received = Buffer.from(receivedHmac, "hex");
    if (expected.length !== received.length) return null;
    if (!crypto.timingSafeEqual(expected, received)) return null;
  } catch {
    return null;
  }

  return { userId, packageKey, locale };
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getConfig() {
  const apiKey = process.env.IYZICO_API_KEY;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  const baseUrl = process.env.IYZICO_BASE_URL;

  if (!apiKey || !secretKey || !baseUrl) {
    throw new Error("Missing iyzico environment variables");
  }

  return { apiKey, secretKey, baseUrl };
}

// ---------------------------------------------------------------------------
// Auth header generation
// ---------------------------------------------------------------------------

/**
 * Generates the current iyzico IYZWSv2 Authorization header and x-iyzi-rnd.
 *
 * signature = HMAC-SHA256(randomKey + endpoint + requestBody, secretKey)
 * Authorization = IYZWSv2 Base64(apiKey:{apiKey}&randomKey:{randomKey}&signature:{signature})
 */
export function generateAuthHeaders(
  endpoint: string,
  requestBody: string,
  randomString = crypto.randomBytes(16).toString("hex")
): {
  authorization: string;
  randomString: string;
} {
  const { apiKey, secretKey } = getConfig();

  if (!endpoint.startsWith("/")) {
    throw new Error("iyzico endpoint must be an absolute path");
  }

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(randomString + endpoint + requestBody)
    .digest("hex");
  const authorizationPayload =
    `apiKey:${apiKey}&randomKey:${randomString}&signature:${signature}`;
  const authorization =
    `IYZWSv2 ${Buffer.from(authorizationPayload, "utf8").toString("base64")}`;

  return { authorization, randomString };
}

// ---------------------------------------------------------------------------
// Generic POST helper
// ---------------------------------------------------------------------------

async function iyzicoPost<T>(endpoint: string, body: object): Promise<T> {
  const { baseUrl } = getConfig();
  const requestBody = JSON.stringify(body);
  const { authorization, randomString } = generateAuthHeaders(
    endpoint,
    requestBody
  );

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authorization,
      "x-iyzi-rnd": randomString,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`iyzico API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Checkout Form – Initialize
// ---------------------------------------------------------------------------

export interface CheckoutFormInitResult {
  status: string;
  locale: string;
  systemTime: number;
  conversationId: string;
  token: string;
  checkoutFormContent: string;
  tokenExpireTime: number;
  paymentPageUrl: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface InitializeCheckoutParams {
  conversationId: string;
  price: string;
  paidPrice: string;
  basketId: string;
  callbackUrl: string;
  buyer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    identityNumber: string;
    registrationAddress: string;
    ip: string;
    city: string;
    country: string;
  };
  basketItems: {
    id: string;
    name: string;
    category1: string;
    itemType: string;
    price: string;
  }[];
}

export async function initializeCheckoutForm(
  params: InitializeCheckoutParams
): Promise<CheckoutFormInitResult> {
  const body = {
    locale: "tr",
    conversationId: params.conversationId,
    price: params.price,
    paidPrice: params.paidPrice,
    currency: "TRY",
    basketId: params.basketId,
    paymentGroup: "PRODUCT",
    callbackUrl: params.callbackUrl,
    buyer: params.buyer,
    shippingAddress: {
      contactName: `${params.buyer.name} ${params.buyer.surname}`,
      city: params.buyer.city,
      country: params.buyer.country,
      address: params.buyer.registrationAddress,
    },
    billingAddress: {
      contactName: `${params.buyer.name} ${params.buyer.surname}`,
      city: params.buyer.city,
      country: params.buyer.country,
      address: params.buyer.registrationAddress,
    },
    basketItems: params.basketItems,
  };

  const result = await iyzicoPost<CheckoutFormInitResult>(
    "/payment/iyzipos/checkoutform/initialize/auth/ecom",
    body
  );

  if (result.status !== "success") {
    throw new Error(
      `iyzico checkout init failed: ${result.errorMessage ?? "Unknown error"}`
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Checkout Form – Retrieve Result
// ---------------------------------------------------------------------------

export interface CheckoutFormResult {
  status: string;
  locale: string;
  systemTime: number;
  conversationId: string;
  paymentId: string;
  price: number;
  paidPrice: number;
  currency: string;
  basketId: string;
  paymentStatus: string;
  fraudStatus: number;
  token: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function retrieveCheckoutFormResult(
  token: string
): Promise<CheckoutFormResult> {
  const body = {
    locale: "tr",
    token,
  };

  const result = await iyzicoPost<CheckoutFormResult>(
    "/payment/iyzipos/checkoutform/auth/ecom/detail",
    body
  );

  return result;
}
