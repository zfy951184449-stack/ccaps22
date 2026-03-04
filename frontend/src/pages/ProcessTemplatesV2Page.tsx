import React from 'react';
import { Alert, Empty } from 'antd';
import { useParams } from 'react-router-dom';
import ProcessTemplateV2 from '../components/ProcessTemplateV2/ProcessTemplateV2';
import ProcessTemplateV2Editor from '../components/ProcessTemplateV2/ProcessTemplateV2Editor';

const ProcessTemplatesV2Page: React.FC = () => {
  const { templateId } = useParams<{ templateId?: string }>();

  if (!templateId) {
    return <ProcessTemplateV2 />;
  }

  const numericTemplateId = Number(templateId);
  if (!Number.isInteger(numericTemplateId) || numericTemplateId <= 0) {
    return (
      <div className="space-y-4">
        <Alert type="error" showIcon message="无效的工艺模版 ID" />
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16">
          <Empty description="当前工艺模版路径不正确" />
        </div>
      </div>
    );
  }

  return <ProcessTemplateV2Editor templateId={numericTemplateId} />;
};

export default ProcessTemplatesV2Page;
