import { apiFetch } from "@/services/http/client";
import { apiHealthSchema } from "./contracts";

export function getApiHealth() {
  return apiFetch("health", { schema: apiHealthSchema });
}
