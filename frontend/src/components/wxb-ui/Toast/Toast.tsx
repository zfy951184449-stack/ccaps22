import { message } from 'antd';
import './Toast.css';

export const wxbToast = {
  success: (content: string, duration = 2) => message.success({ content, duration, className: 'wxb-toast' }),
  error: (content: string, duration = 3) => message.error({ content, duration, className: 'wxb-toast' }),
  warning: (content: string, duration = 2.5) => message.warning({ content, duration, className: 'wxb-toast' }),
  info: (content: string, duration = 2) => message.info({ content, duration, className: 'wxb-toast' }),
  loading: (content: string, duration = 0) => message.loading({ content, duration, className: 'wxb-toast' }),
};
