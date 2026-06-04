/**
 * loadEnv —— 在任何其它模块求值前加载 .env。
 *
 * 为什么单独成一个模块：ES 模块的 import 会先于同文件内的普通语句求值。
 * server.ts 里若把 `dotenv.config()` 写成普通语句，它会晚于 `import './middleware/requireAuth'`
 * 执行——而 requireAuth → JwtService 在模块加载阶段就读 JWT_SECRET 并 fail-fast，
 * 于是 .env 还没加载就先炸。把 dotenv.config() 放进本模块，并让 server.ts 把它作为
 * **第一条 import**，即可保证 .env 在认证链（及其它读 env 的模块）求值前就已注入。
 *
 * 幂等：dotenv.config() 多次调用不会覆盖已存在的 process.env（如测试里 vi.hoisted 预设的值）。
 */
import dotenv from 'dotenv';

dotenv.config();

export {};
