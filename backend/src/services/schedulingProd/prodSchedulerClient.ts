/**
 * 排产引擎(prod_scheduler)HTTP 客户端。排产 ≠ 排班,独立微服务、独立端口 5007。
 */
import type { CipPeakRequestBody, StateCheckRequestBody } from './ProdDataAssembler';

export const PROD_SCHEDULER_URL = process.env.PROD_SCHEDULER_URL || 'http://localhost:5007';

export async function callCipPeak(body: CipPeakRequestBody): Promise<any> {
  const res = await fetch(`${PROD_SCHEDULER_URL}/api/prod/v1/cip-peak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`排产引擎 cip-peak 返回 ${res.status}: ${text}`);
  }
  return res.json();
}

export async function callStateCheck(body: StateCheckRequestBody): Promise<any> {
  const res = await fetch(`${PROD_SCHEDULER_URL}/api/prod/v1/state-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`排产引擎 state-check 返回 ${res.status}: ${text}`);
  }
  return res.json();
}
