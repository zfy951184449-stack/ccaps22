import { resolveApiBaseUrl } from "@/lib/env";
import { z } from "zod";
import { apiFetch } from "./client";

const schema = z.object({
  ok: z.boolean(),
});

describe("apiFetch", () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBase;
  });

  it("uses the public API base and validates payloads", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "/precision-api";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    const result = await apiFetch("health", { schema });

    expect(result.ok).toBe(true);
    expect(resolveApiBaseUrl()).toBe("/precision-api");
    expect(global.fetch).toHaveBeenCalledWith(
      "/precision-api/health",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });
});
