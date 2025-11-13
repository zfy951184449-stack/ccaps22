/**
 * Fluent Design System Common Components
 * 统一的加载、空状态、错误显示组件
 */

import React from 'react';
import { Spin, Empty, Alert, Result } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { fluentDesignTokens } from '../../styles/fluentDesignTokens';

/**
 * LoadingState 组件 - 统一的加载状态显示
 */
interface LoadingStateProps {
  tip?: string;
  size?: 'small' | 'default' | 'large';
  fullScreen?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  tip = '加载中...',
  size = 'large',
  fullScreen = false,
}) => {
  const antIcon = <LoadingOutlined style={{ fontSize: size === 'large' ? 48 : size === 'default' ? 32 : 24 }} spin />;

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: fluentDesignTokens.spacing.md,
        padding: fluentDesignTokens.spacing.xxxl,
        color: fluentDesignTokens.colors.textSecondary,
      }}
    >
      <Spin indicator={antIcon} size={size} />
      <div style={{ fontSize: fluentDesignTokens.typography.fontSize.body, marginTop: fluentDesignTokens.spacing.md }}>
        {tip}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.9)',
          zIndex: 9999,
        }}
      >
        {content}
      </div>
    );
  }

  return content;
};

/**
 * EmptyState 组件 - 统一的空状态显示
 */
interface EmptyStateProps {
  description?: string;
  image?: React.ReactNode;
  action?: React.ReactNode;
  type?: 'default' | 'search' | 'data';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  description = '暂无数据',
  image,
  action,
  type = 'default',
}) => {
  const emptyDescriptions = {
    default: '暂无数据',
    search: '没有找到匹配的结果',
    data: '当前没有数据',
  };

  return (
    <Empty
      image={image || Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div
          style={{
            fontSize: fluentDesignTokens.typography.fontSize.body,
            color: fluentDesignTokens.colors.textSecondary,
            marginTop: fluentDesignTokens.spacing.md,
          }}
        >
          {description || emptyDescriptions[type]}
        </div>
      }
      style={{
        padding: fluentDesignTokens.spacing.xxxl,
      }}
    >
      {action && (
        <div style={{ marginTop: fluentDesignTokens.spacing.lg }}>
          {action}
        </div>
      )}
    </Empty>
  );
};

/**
 * ErrorDisplay 组件 - 统一的错误显示
 */
interface ErrorDisplayProps {
  message?: string;
  description?: string;
  type?: 'error' | 'warning' | 'info';
  showIcon?: boolean;
  action?: React.ReactNode;
  onRetry?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  message = '出现错误',
  description,
  type = 'error',
  showIcon = true,
  action,
  onRetry,
}) => {
  const errorConfig = {
    error: {
      status: 'error',
      title: '错误',
      color: fluentDesignTokens.colors.error,
    },
    warning: {
      status: 'warning',
      title: '警告',
      color: fluentDesignTokens.colors.warning,
    },
    info: {
      status: 'info',
      title: '提示',
      color: fluentDesignTokens.colors.info,
    },
  };

  const config = errorConfig[type];

  if (description) {
    return (
      <Result
        status={config.status as any}
        title={message}
        subTitle={description}
        extra={
          action || (onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: `${fluentDesignTokens.spacing.sm} ${fluentDesignTokens.spacing.lg}`,
                backgroundColor: fluentDesignTokens.colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: fluentDesignTokens.borderRadius.md,
                cursor: 'pointer',
                fontWeight: fluentDesignTokens.typography.fontWeight.semibold,
                transition: `all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = fluentDesignTokens.colors.accentDark;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = fluentDesignTokens.colors.accent;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              重试
            </button>
          ))
        }
      />
    );
  }

  return (
    <Alert
      message={message}
      description={description}
      type={type}
      showIcon={showIcon}
      action={action}
      style={{
        borderRadius: fluentDesignTokens.borderRadius.md,
        border: `1px solid ${config.color}`,
      }}
    />
  );
};

/**
 * StatCard 组件 - 统一的统计卡片
 */
interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        background: fluentDesignTokens.colors.background,
        borderRadius: fluentDesignTokens.borderRadius.lg,
        padding: fluentDesignTokens.spacing.lg,
        boxShadow: fluentDesignTokens.elevation.level1,
        cursor: onClick ? 'pointer' : 'default',
        transition: `all ${fluentDesignTokens.animation.duration.standard} ${fluentDesignTokens.animation.easing.standard}`,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = fluentDesignTokens.elevation.level2;
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = fluentDesignTokens.elevation.level1;
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: fluentDesignTokens.spacing.sm,
        }}
      >
        <div
          style={{
            fontSize: fluentDesignTokens.typography.fontSize.bodySmall,
            color: fluentDesignTokens.colors.textSecondary,
            fontWeight: fluentDesignTokens.typography.fontWeight.regular,
          }}
        >
          {title}
        </div>
        {icon && (
          <div style={{ color: fluentDesignTokens.colors.accent }}>
            {icon}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: fluentDesignTokens.typography.fontSize.titleLarge,
          fontWeight: fluentDesignTokens.typography.fontWeight.bold,
          color: fluentDesignTokens.colors.textPrimary,
          lineHeight: fluentDesignTokens.typography.lineHeight.titleLarge,
        }}
      >
        {value}
      </div>
      {trend && (
        <div
          style={{
            marginTop: fluentDesignTokens.spacing.xs,
            fontSize: fluentDesignTokens.typography.fontSize.caption,
            color: trend.isPositive ? fluentDesignTokens.colors.success : fluentDesignTokens.colors.error,
          }}
        >
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </div>
      )}
    </div>
  );
};

