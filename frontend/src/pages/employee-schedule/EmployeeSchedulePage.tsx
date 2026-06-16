/**
 * EmployeeSchedulePage —— 排班界面（/my-schedule）。
 *
 * 旧实现已移除，等待重构。路由与菜单入口保留，页面暂为空白占位。
 */
import React from 'react';
import { WxbPageShell, WxbEmpty } from '../../components/wxb-ui';

const EmployeeSchedulePage: React.FC = () => {
  return (
    <WxbPageShell>
      <WxbEmpty description="排班界面待重构" />
    </WxbPageShell>
  );
};

export default EmployeeSchedulePage;
