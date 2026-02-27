import React from 'react';
import { Layout, Typography } from 'antd';
import BatchManagementV4 from '../components/BatchManagementV4';
import { fluentDesignTokens } from '../styles/fluentDesignTokens';

const { Content } = Layout;
const { Title } = Typography;

const BatchManagementV4Page: React.FC = () => {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Page Header is handled by Layout/App.tsx usually, but we keep the title here for local context if needed */}
            <div style={{ marginBottom: fluentDesignTokens.spacing.lg, padding: '0 8px' }}>
                <Title level={4} style={{ margin: 0, color: fluentDesignTokens.colors.textSecondary }}>
                    批次管理 V4
                </Title>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
                <BatchManagementV4 />
            </div>
        </div>
    );
};

export default BatchManagementV4Page;
