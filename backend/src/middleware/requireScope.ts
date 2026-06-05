/**
 * requireScope(resolver) —— 数据范围（scope）校验中间件工厂。
 *
 * 只对【写操作】挂载（读端点不挂——跨团队只读是既定规则）。判定顺序：
 *   1. 影子模式（AUTH_ENFORCE !== 'true'，默认）→ 放行。
 *      （与 requireAuth / requirePermission 的影子语义一致：先上线观察，绝不拦现有前端。）
 *   2. 无 req.user → 放行（影子模式下匿名；强制模式下 requireAuth/requirePermission 已先拦）。
 *   3. ScopeService.getAccessibleScope(userId).isGlobal → 放行（全局角色/全局授权豁免）。
 *   4. resolver(req) 解析出资源归属单元：
 *        - 解析为 null（资源无 team / 不存在 / 视为全局资源）→ 放行（不在 scope 维度拦主数据）。
 *        - 单元 ∈ accessibleUnitIds → 放行。
 *        - 否则 → 403 { success:false, error, code:'SCOPE_FORBIDDEN' }。
 *
 * 设计约束：
 *   - 本中间件只读 req（params/body/query），不改 handler 逻辑、不改响应结构（仅在拒绝时短路）。
 *   - resolver 自行决定从哪取 resourceId 与 resourceType；解析不到 id 时应返回 null（放行，
 *     交给 handler 自己的 400 校验，scope 层不替业务做参数校验）。
 *   - 与 requirePermission 配合使用：典型顺序 requirePermission(_WRITE) → requireScope(resolver)。
 *     权限管“能不能做这类操作”，scope 管“能不能对这个团队的资源做”。
 */
import type { Request, Response, NextFunction } from 'express';
import './authTypes';
import { ScopeService } from '../services/governance/ScopeService';

const isEnforced = (): boolean => process.env.AUTH_ENFORCE === 'true';

/**
 * resolver：从请求解析出待校验资源归属的组织单元 id。
 *   - 返回 number  → 该资源归属此单元，按 scope 校验。
 *   - 返回 null    → 无法/无需按 scope 限定（全局资源 / 缺参数）→ 放行。
 * 允许同步或异步实现。
 */
export type ScopeResolver = (req: Request) => Promise<number | null> | number | null;

export function requireScope(resolver: ScopeResolver) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. 影子模式：放行。
    if (!isEnforced()) {
      next();
      return;
    }

    // 2. 无身份：放行（强制模式下理论上已被前序认证拦截，这里不重复 401，保持单一职责）。
    if (!req.user) {
      next();
      return;
    }

    try {
      const scope = await ScopeService.getAccessibleScope(req.user.userId);

      // 3. 全局授权：放行。
      if (scope.isGlobal) {
        next();
        return;
      }

      // 4. 解析资源归属单元。
      const unitId = await resolver(req);

      // 解析不到归属（全局资源 / 缺参数）→ 不在 scope 维度拦截。
      if (unitId === null || unitId === undefined) {
        next();
        return;
      }

      if (scope.accessibleUnitIds.has(unitId)) {
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: 'Resource is outside your authorized organization scope',
        code: 'SCOPE_FORBIDDEN',
      });
    } catch (error) {
      // scope 回源出错：交给全局错误处理器（500），不静默放行受保护写操作。
      next(error);
    }
  };
}

export default requireScope;
