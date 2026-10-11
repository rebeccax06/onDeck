import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { clerkAuthenticator } from "../../src/auth.ts";

// Local signing keys exercise Clerk's real verifier without a Clerk account or network.
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const now = Math.floor(Date.now() / 1000);
const authenticate = clerkAuthenticator({
  secretKey: "sk_test_local_verification_only",
  publishableKey: `pk_test_${Buffer.from("clerk.example.test$").toString("base64")}`,
  authorizedParties: ["http://127.0.0.1:8080"],
  jwtKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
});
function token(changes: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://clerk.example.test", sub: "user_amy", sid: "sess_test", v: 2,
    azp: "http://127.0.0.1:8080", iat: now - 5, nbf: now - 5, exp: now + 300,
    ...changes,
  })).toString("base64url");
  const data = `${header}.${payload}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), keys.privateKey).toString("base64url")}`;
}
function request(value?: string) {
  return new Request("http://127.0.0.1:3000/api/groups/list", {
    method: "POST", headers: value ? { Authorization: `Bearer ${value}` } : {},
  });
}

describe("Clerk session authentication", () => {
  test("a verified session supplies its stable account identity", async () => {
    expect(await authenticate(request(token()))).toBe("user_amy");
  });
  test("missing or malformed tokens cannot supply an identity", async () => {
    expect(await authenticate(request())).toBeNull();
    expect(await authenticate(request("not-a-token"))).toBeNull();
  });
  test("expired and not-yet-valid tokens are rejected", async () => {
    expect(await authenticate(request(token({ exp: now - 60 })))).toBeNull();
    expect(await authenticate(request(token({ nbf: now + 300 })))).toBeNull();
  });
  test("tokens issued for another frontend origin are rejected", async () => {
    expect(await authenticate(request(token({ azp: "https://other.example" })))).toBeNull();
  });
  test("modifying an account identity invalidates the signature", async () => {
    const parts = token().split(".");
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
    payload.sub = "user_victim";
    parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(await authenticate(request(parts.join(".")))).toBeNull();
  });
});
