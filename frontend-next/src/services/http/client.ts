import { resolveApiBaseUrl } from "@/lib/env";
import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function parsePayload(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { schema?: ZodType<T> } = {},
) {
  const { headers, schema, ...init } = options;

  const response = await fetch(joinUrl(resolveApiBaseUrl(), path), {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  });

  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new ApiError(
      `Request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  return schema ? schema.parse(payload) : (payload as T);
}
