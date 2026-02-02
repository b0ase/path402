/**
 * $402 Client Service
 * 
 * Handles HTTP communication with $402-enabled servers.
 * Discovers pricing, submits payments, retrieves content.
 * 
 * In production this would make real HTTP requests.
 * For the MVP it also includes a mock server for testing.
 */

import { Dollar402Response, PricingModel, RevenueModel } from "../types.js";
import { PROTOCOL_VERSION } from "../constants.js";

/**
 * Discover the $402 terms for a given URL.
 * Makes a GET request and interprets the 402 response.
 */
export async function discover(url: string): Promise<Dollar402Response> {
  // Normalise: ensure URL starts with https:// if it starts with $
  const httpUrl = normaliseUrl(url);

  try {
    const response = await fetch(httpUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Protocol": "$402"
      }
    });

    // A $402 server should return 402 with pricing in the body
    if (response.status === 402) {
      const body = await response.json() as Dollar402Response;
      return body;
    }

    // If we get 200, content is free (no $402 gate)
    if (response.ok) {
      throw new Error(`${url} returned 200 OK - content is not $402-gated`);
    }

    // Other errors
    throw new Error(`${url} returned HTTP ${response.status}`);
  } catch (error) {
    // If fetch fails entirely (e.g. no server running), use mock for demo
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return getMockResponse(url);
    }
    // Re-throw if it's our own error
    if (error instanceof Error && (
      error.message.includes("returned") ||
      error.message.includes("not $402-gated")
    )) {
      throw error;
    }
    // Fall back to mock for demo purposes
    return getMockResponse(url);
  }
}

/**
 * Submit payment and retrieve content.
 * In production: sends payment proof in headers.
 * For MVP: simulates the payment flow.
 */
export async function acquireContent(
  url: string,
  _paymentProof: string
): Promise<{ content: string; contentType: string }> {
  const httpUrl = normaliseUrl(url);

  try {
    const response = await fetch(httpUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Protocol": "$402",
        "X-Payment-Proof": _paymentProof
      }
    });

    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "text/plain";
      const content = await response.text();
      return { content, contentType };
    }

    // Still getting 402 means payment wasn't accepted
    if (response.status === 402) {
      throw new Error("Payment not accepted by server");
    }

    throw new Error(`Unexpected response: HTTP ${response.status}`);
  } catch (error) {
    // Fall back to mock content for demo
    if (error instanceof Error && error.message.includes("Payment not accepted")) {
      throw error;
    }
    return getMockContent(url);
  }
}

/**
 * Convert $address notation to HTTPS URL
 * $b0ase.com/$blog/$my-post → https://b0ase.com/$blog/$my-post
 */
function normaliseUrl(url: string): string {
  if (url.startsWith("$")) {
    return `https://${url.slice(1)}`;
  }
  if (url.startsWith("http")) {
    return url;
  }
  return `https://${url}`;
}

/**
 * Mock $402 response for testing without a live server
 */
function getMockResponse(url: string): Dollar402Response {
  // Extract a plausible $address from the URL
  const dollarAddress = url.startsWith("$") ? url : `$${url.replace(/^https?:\/\//, "")}`;

  // Count $ segments to determine depth and pricing
  const segments = dollarAddress.split("/").filter(s => s.startsWith("$"));
  const depth = segments.length;
  const basePrice = depth * 500; // deeper = more expensive
  const mockSupply = Math.floor(Math.random() * 50) + 1;

  return {
    protocol: "$402",
    version: PROTOCOL_VERSION,
    dollarAddress,
    pricing: {
      model: PricingModel.SQRT_DECAY,
      basePrice,
      currency: "SAT"
    },
    revenue: {
      model: RevenueModel.FIXED_ISSUER,
      issuerShare: 0.5
    },
    currentSupply: mockSupply,
    currentPrice: Math.round(basePrice / Math.sqrt(mockSupply)),
    paymentAddress: "mock-handcash-handle",
    contentType: "text/markdown",
    contentPreview: `Preview of content at ${dollarAddress}`,
    children: depth < 3 ? [
      `${dollarAddress}/$example-child-1`,
      `${dollarAddress}/$example-child-2`
    ] : []
  };
}

/**
 * Mock content for testing
 */
function getMockContent(url: string): { content: string; contentType: string } {
  const dollarAddress = url.startsWith("$") ? url : `$${url.replace(/^https?:\/\//, "")}`;

  return {
    content: [
      `# Content from ${dollarAddress}`,
      "",
      "This is mock content served by the $402 protocol demo.",
      "In production, this would be the actual gated content",
      "delivered after payment verification.",
      "",
      "The token you received grants you serving rights.",
      "Future buyers may receive this content from your node,",
      "earning you a share of the transaction revenue."
    ].join("\n"),
    contentType: "text/markdown"
  };
}
