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
