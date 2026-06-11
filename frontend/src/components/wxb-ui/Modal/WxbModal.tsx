import React from 'react';
import { Modal, ModalProps } from 'antd';
import { WxbButton } from '../Button/Button';
import { WxbIcon } from '../Icon/Icon';
import { resolvePortalContainer } from '../_internal/portalContainer';
import './WxbModal.css';

export interface WxbModalProps extends ModalProps {
  okVariant?: 'primary' | 'danger';
}

export const WxbModal: React.FC<WxbModalProps> = ({
  children,
  className = '',
  rootClassName = '',
  wrapClassName = '',
  title,
  onOk,
  onCancel,
  okText = '确定',
  cancelText = '取消',
  confirmLoading,
  footer,
  closeIcon,
  okVariant = 'primary',
  // 默认挂进当前全屏元素(无全屏时为 document.body),避免全屏下被 top layer 遮挡;
  // 调用方显式传 getContainer 则尊重其值。
  getContainer = resolvePortalContainer,
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
    <h2 className="wxb-h4 wxb-modal-title">{title}</h2>
  ) : undefined;

  return (
    <Modal
      className={`wxb-modal ${className}`}
      rootClassName={`wxb-modal-root ${rootClassName}`}
      wrapClassName={`wxb-modal-wrap ${wrapClassName}`}
      title={customTitle}
      footer={customFooter}
      getContainer={getContainer}
      onCancel={onCancel}
      closeIcon={closeIcon ?? (
        <span className="wxb-modal-close-icon" aria-label="关闭">
          <WxbIcon name="close" size={18} />
        </span>
      )}
      {...props}
    >
      {children}
    </Modal>
  );
};
