import React from 'react';
import { Modal, ModalProps } from 'antd';
import { WxbButton } from '../Button/Button';
import './WxbModal.css';

export interface WxbModalProps extends ModalProps {
  okVariant?: 'primary' | 'danger';
}

export const WxbModal: React.FC<WxbModalProps> = ({ 
  children, 
  className = '',
  title,
  onOk,
  onCancel,
  okText = '确定',
  cancelText = '取消',
  confirmLoading,
  footer,
  okVariant = 'primary',
  ...props 
}) => {
  const customFooter = footer === undefined ? (
    <div className="wxb-modal-footer">
      <WxbButton variant="ghost" onClick={onCancel as any}>
        {cancelText}
      </WxbButton>
      <WxbButton variant={okVariant} onClick={onOk as any} disabled={confirmLoading}>
        {confirmLoading ? '处理中...' : okText}
      </WxbButton>
    </div>
  ) : footer;

  const customTitle = title ? (
    <h2 className="wxb-h4" style={{ margin: 0 }}>{title}</h2>
  ) : undefined;

  return (
    <Modal
      className={`wxb-modal ${className}`}
      title={customTitle}
      footer={customFooter}
      onCancel={onCancel}
      closeIcon={<span className="wxb-modal-close-icon">✕</span>}
      {...props}
    >
      {children}
    </Modal>
  );
};
