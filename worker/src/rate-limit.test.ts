import { describe, expect, it } from "vitest";
import { pickRateLimitBucket } from "./rate-limit";

describe("pickRateLimitBucket", () => {
  it("ne compte jamais une méthode sûre", () => {
    expect(pickRateLimitBucket("/auth/login", "GET")).toBeNull();
    expect(pickRateLimitBucket("/events/1", "HEAD")).toBeNull();
    expect(pickRateLimitBucket("/events/1", "OPTIONS")).toBeNull();
  });

  it("classe les écritures sous /auth/ dans le quota auth", () => {
    expect(pickRateLimitBucket("/auth/login", "POST")).toBe("auth");
    expect(pickRateLimitBucket("/auth/signup", "POST")).toBe("auth");
    expect(pickRateLimitBucket("/auth/google", "POST")).toBe("auth");
  });

  it("classe les autres écritures dans le quota write", () => {
    expect(pickRateLimitBucket("/events", "POST")).toBe("write");
    expect(pickRateLimitBucket("/events/1/drivers", "POST")).toBe("write");
    expect(pickRateLimitBucket("/events/1", "PATCH")).toBe("write");
    expect(pickRateLimitBucket("/events/1/drivers/2", "DELETE")).toBe("write");
  });
});
