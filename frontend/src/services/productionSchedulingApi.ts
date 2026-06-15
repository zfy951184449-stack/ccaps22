/**
 * 排产(production scheduling)API —— 第一刀:暂返 WBP2486 mock。
 *
 * TODO(v0.3 落地):替换为新建排产引擎(独立 Python/Flask 微服务,纯传播,仿 solver_v4/v5 形态)的真实端点,
 *   走相对 /api 路径(setupProxy 代理),如 GET /api/production-scheduling/:id。全程不碰 V4。
 */
import type { PsSchedule } from '../types/productionScheduling';
import { buildWbp2486MockSchedule } from '../mock/wbp2486Schedule';

export const productionSchedulingApi = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSchedule(_id?: string): Promise<PsSchedule> {
    return buildWbp2486MockSchedule();
  },
};
