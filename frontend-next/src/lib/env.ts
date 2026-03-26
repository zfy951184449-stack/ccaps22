const DEFAULT_API_BASE_URL = "/api";

export function resolveApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}
