import React from 'react';
import { useParams } from 'react-router-dom';
import ProcessTemplateV3List from '../components/ProcessTemplateV3/ProcessTemplateV3List';
import ProcessTemplateV3Editor from '../components/ProcessTemplateV3/ProcessTemplateV3Editor';
import { WxbEmpty } from '../components/wxb-ui';

const ProcessTemplatesV3Page: React.FC = () => {
  const { templateId } = useParams<{ templateId?: string }>();

  if (!templateId) {
    return <ProcessTemplateV3List />;
  }

  const numericTemplateId = Number(templateId);
  if (!Number.isInteger(numericTemplateId) || numericTemplateId <= 0) {
    return (
      <div style={{ padding: 64 }}>
        <WxbEmpty description="无效的工艺模版 ID，请检查路径。" />
      </div>
    );
  }

  return <ProcessTemplateV3Editor templateId={numericTemplateId} />;
};

export default ProcessTemplatesV3Page;
