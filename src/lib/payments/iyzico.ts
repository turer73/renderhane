import crypto from "crypto";

// ---------------------------------------------------------------------------
// Package definitions
// ---------------------------------------------------------------------------

export const PACKAGES = {
  starter: { credits: 50, price: 49, name: "Starter" },
  standard: { credits: 200, price: 149, name: "Standard" },
  pro: { credits: 500, price: 299, name: "Professional" },
} as const;

export type PackageKey = keyof typeof PACKAGES;

export function isValidPackageKey(key: string): key is PackageKey {
  return key in PACKAGES;
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
 * Generates the iyzico Authorization header value and the x-iyzi-rnd value.
 *
 * Authorization: IYZWS {apiKey}:{hashStr}
 * hashStr = Base64( SHA1( apiKey + randomString + secretKey + requestBody ) )
 */
function generateAuthHeaders(requestBody: string): {
  authorization: string;
  randomString: string;
} {
  const { apiKey, secretKey } = getConfig();

  const randomString = crypto.randomBytes(8).toString("hex");
  const hashData = apiKey + randomString + secretKey + requestBody;
  const sha1Hash = crypto.createHash("sha1").update(hashData).digest("base64");
  const authorization = `IYZWS ${apiKey}:${sha1Hash}`;

  return { authorization, randomString };
}

// ---------------------------------------------------------------------------
// Generic POST helper
// ---------------------------------------------------------------------------

async function iyzicoPost<T>(endpoint: string, body: object): Promise<T> {
  const { baseUrl } = getConfig();
  const requestBody = JSON.stringify(body);
  const { authorization, randomString } = generateAuthHeaders(requestBody);

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
    "/payment/ixica/checkout/token",
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
    "/payment/ixica/checkout/auth/ecom/detail",
    body
  );

  return result;
}
