import { useMemo } from 'react';
import { message } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import './Toast.css';

const createWxbToast = (api: MessageInstance) => ({
  success: (content: string, duration = 2) => api.success({ content, duration, className: 'wxb-toast' }),
  error: (content: string, duration = 3) => api.error({ content, duration, className: 'wxb-toast' }),
  warning: (content: string, duration = 2.5) => api.warning({ content, duration, className: 'wxb-toast' }),
  info: (content: string, duration = 2) => api.info({ content, duration, className: 'wxb-toast' }),
  loading: (content: string, duration = 0) => api.loading({ content, duration, className: 'wxb-toast' }),
});

export const wxbToast = {
  success: (content: string, duration = 2) => message.success({ content, duration, className: 'wxb-toast' }),
  error: (content: string, duration = 3) => message.error({ content, duration, className: 'wxb-toast' }),
  warning: (content: string, duration = 2.5) => message.warning({ content, duration, className: 'wxb-toast' }),
  info: (content: string, duration = 2) => message.info({ content, duration, className: 'wxb-toast' }),
  loading: (content: string, duration = 0) => message.loading({ content, duration, className: 'wxb-toast' }),
};

export const useWxbToast = () => {
  const [api, contextHolder] = message.useMessage();
  const toast = useMemo(() => createWxbToast(api), [api]);
  return [toast, contextHolder] as const;
};

/**
 * 让全局 wxbToast 在原生全屏期间也可见。
 *
 * antd 的 message 是全局单例,挂载点只能通过 message.config({ getContainer }) 全局配置,
 * 无法逐条传 getContainer。这里监听 fullscreenchange:进入全屏时把容器切到全屏元素,
 * 退出时复位回 document.body。返回一个 cleanup 函数(移除监听并复位),供 effect 卸载时调用。
 *
 * 非全屏期间容器始终是 document.body,与原行为一致,对非全屏场景零影响。
 */
export function setupFullscreenToast(): () => void {
  if (typeof document === 'undefined') return () => {};

  const applyContainer = () => {
    const fsEl = document.fullscreenElement as HTMLElement | null;
    message.config({ getContainer: () => fsEl ?? document.body });
  };

  applyContainer();
  document.addEventListener('fullscreenchange', applyContainer);

  return () => {
    document.removeEventListener('fullscreenchange', applyContainer);
    message.config({ getContainer: () => document.body });
  };
}
