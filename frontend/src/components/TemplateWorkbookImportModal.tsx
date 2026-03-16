import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  List,
  Modal,
  Segmented,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import axios from 'axios';
import {
  importTemplateWorkbook,
  previewTemplateWorkbookImport,
  TemplateWorkbookImportMode,
  TemplateWorkbookIssue,
  TemplateWorkbookMutationResult,
} from '../services/templateWorkbookApi';

const { Dragger } = Upload;
const { Text } = Typography;

interface TemplateWorkbookImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: TemplateWorkbookMutationResult) => void;
  title?: string;
}

const renderIssueLabel = (issue: TemplateWorkbookIssue) => {
  const parts = [issue.sheet];
  if (issue.row) {
    parts.push(`第 ${issue.row} 行`);
  }
  if (issue.field) {
    parts.push(issue.field);
  }
  return parts.join(' · ');
};

const extractResultFromError = (error: unknown): TemplateWorkbookMutationResult | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }
  const data = error.response?.data;
  if (!data || typeof data !== 'object') {
    return null;
  }
  if (!('blocking_errors' in data) || !('summary' in data)) {
    return null;
  }
  return data as TemplateWorkbookMutationResult;
};

const TemplateWorkbookImportModal: React.FC<TemplateWorkbookImportModalProps> = ({
  open,
  onClose,
  onImported,
  title = '导入 Excel',
}) => {
  const [mode, setMode] = useState<TemplateWorkbookImportMode>('create');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<TemplateWorkbookMutationResult | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }
    setMode('create');
    setFileList([]);
    setPreviewResult(null);
    setPreviewLoading(false);
    setImportLoading(false);
  }, [open]);

  const selectedFile = useMemo(() => {
    const originFile = fileList[0]?.originFileObj;
    return originFile instanceof File ? originFile : null;
  }, [fileList]);

  const handlePreview = async () => {
    if (!selectedFile) {
      message.warning('请先选择 Excel 文件');
      return;
    }

    try {
      setPreviewLoading(true);
      const result = await previewTemplateWorkbookImport(selectedFile, mode);
      setPreviewResult(result);
      if (result.can_import) {
        message.success('Excel 预检通过');
      } else {
        message.warning('Excel 预检存在阻断问题');
      }
    } catch (error) {
      console.error('Failed to preview workbook import:', error);
      const result = extractResultFromError(error);
      if (result) {
        setPreviewResult(result);
        message.warning('Excel 预检存在阻断问题');
        return;
      }
      message.error('Excel 预检失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      message.warning('请先选择 Excel 文件');
      return;
    }

    try {
      setImportLoading(true);
      const result = await importTemplateWorkbook(selectedFile, mode);
      setPreviewResult(result);
      message.success(`导入完成：${result.template_results.length} 个模板`);
      onImported(result);
      onClose();
    } catch (error) {
      console.error('Failed to import workbook:', error);
      const result = extractResultFromError(error);
      if (result) {
        setPreviewResult(result);
        message.error('导入失败，请先修正 Excel 中的阻断问题');
        return;
      }
      message.error('导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const footer = (
    <Space>
      <Button onClick={onClose}>取消</Button>
      <Button onClick={handlePreview} loading={previewLoading} disabled={!selectedFile}>
        预检 Excel
      </Button>
      <Button
        type="primary"
        onClick={handleImport}
        loading={importLoading}
        disabled={!selectedFile || !previewResult || !previewResult.can_import}
      >
        确认导入
      </Button>
    </Space>
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={footer}
      width={920}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Alert
          type="info"
          showIcon
          message="仅支持系统导出的工艺模版 Excel"
          description="先预检再确认导入。replace 模式会保留 template_id，但会拒绝替换已被批次引用的模板。"
        />

        <Space align="center" size={16}>
          <Text strong>导入模式</Text>
          <Segmented
            value={mode}
            onChange={(value) => {
              setMode(value as TemplateWorkbookImportMode);
              setPreviewResult(null);
            }}
            options={[
              { label: '新建 create', value: 'create' },
              { label: '替换 replace', value: 'replace' },
            ]}
          />
        </Space>

        <Dragger
          accept=".xlsx"
          multiple={false}
          maxCount={1}
          fileList={fileList}
          beforeUpload={() => false}
          onChange={({ fileList: nextList }) => {
            setFileList(nextList.slice(-1));
            setPreviewResult(null);
          }}
          onRemove={() => {
            setFileList([]);
            setPreviewResult(null);
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 Excel 文件到此处</p>
          <p className="ant-upload-hint">支持 `.xlsx`，会按系统 workbook 模板做预检与导入</p>
        </Dragger>

        {previewResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Descriptions
              bordered
              size="small"
              column={4}
              items={[
                { key: 'templates', label: '模板', children: previewResult.summary.template_count },
                { key: 'stages', label: '阶段', children: previewResult.summary.stage_count },
                { key: 'operations', label: '操作', children: previewResult.summary.operation_count },
                { key: 'constraints', label: '约束', children: previewResult.summary.constraint_count },
                { key: 'shareGroups', label: '共享组', children: previewResult.summary.share_group_count },
                { key: 'members', label: '共享成员', children: previewResult.summary.share_group_member_count },
                { key: 'bindings', label: '资源绑定', children: previewResult.summary.resource_binding_count },
                { key: 'requirements', label: '资源需求', children: previewResult.summary.resource_requirement_count },
              ]}
            />

            <div>
              <Text strong>模板动作</Text>
              <List
                size="small"
                dataSource={previewResult.template_actions}
                locale={{ emptyText: '当前文件没有可处理的模板动作' }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={0}>
                      <Text strong>{item.template_code} · {item.template_name}</Text>
                      <Text type={item.blocked_reason ? 'danger' : 'secondary'}>
                        {item.action.toUpperCase()}
                        {item.target_template_id ? ` → ID ${item.target_template_id}` : ''}
                        {item.blocked_reason ? ` · ${item.blocked_reason}` : ''}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>

            {previewResult.blocking_errors.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message={`阻断问题 ${previewResult.blocking_errors.length} 条`}
                description={
                  <List
                    size="small"
                    dataSource={previewResult.blocking_errors}
                    renderItem={(issue) => (
                      <List.Item>
                        <Space direction="vertical" size={0}>
                          <Text strong>{renderIssueLabel(issue)}</Text>
                          <Text type="danger">{issue.message}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                }
              />
            ) : (
              <Alert type="success" showIcon message="预检通过，可执行导入" />
            )}

            {previewResult.warnings.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                message={`告警 ${previewResult.warnings.length} 条`}
                description={
                  <List
                    size="small"
                    dataSource={previewResult.warnings}
                    renderItem={(issue) => (
                      <List.Item>
                        <Space direction="vertical" size={0}>
                          <Text strong>{renderIssueLabel(issue)}</Text>
                          <Text>{issue.message}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default TemplateWorkbookImportModal;
