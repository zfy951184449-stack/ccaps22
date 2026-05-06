import React from 'react';
import { Table as AntdTable } from 'antd';
import type { TableProps as AntdTableProps } from 'antd';
import './DataTable.css';

export interface WxbDataTableProps<T = any> extends AntdTableProps<T> {}

export function WxbDataTable<T extends object>(props: WxbDataTableProps<T>) {
  return <AntdTable<T> className={`wxb-data-table ${props.className || ''}`} {...props} />;
}
