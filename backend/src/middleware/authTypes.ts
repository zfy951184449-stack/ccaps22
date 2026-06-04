/**
 * Express 类型扩展 —— 把"已认证用户"挂到 req.user。
 *
 * 这是认证接入层（中间件/控制器）的类型粘合点：requireAuth 验签成功后把 AuthenticatedUser
 * 挂到 req.user，后续 requirePermission / 控制器再从 req.user 读取。形状权威在
 * domain/auth/authTypes.ts（AuthenticatedUser），这里只做 Express.Request 的声明合并，
 * 不重新定义形状，避免契约漂移。
 *
 * 注意：本文件必须被 tsc 纳入编译图（被 server/中间件 import 一次）才能让全局声明生效；
 * 因此 requireAuth.ts 会 `import './authTypes'`（仅为副作用）。
 */
import type { AuthenticatedUser } from '../domain/auth/authTypes';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** 由 requireAuth 在验签通过后装配；影子模式下无 token 时为 undefined。 */
      user?: AuthenticatedUser;
    }
  }
}

// 让本文件成为模块（拥有顶层 import/export 时即为模块），declare global 才会被当作"全局增强"。
export {};
