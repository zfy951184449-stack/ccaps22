import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Qualification } from '../types';
import { qualificationApi } from '../services/api';
import {
  WxbButton,
  WxbDataTable,
  WxbFilterBar,
  WxbInput,
  WxbModal,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
  WxbTableActionCell,
  WxbTag,
  wxbToast,
} from './wxb-ui';
import './QualificationTable.css';

type QualificationIconName = 'plus' | 'refresh';

interface QualificationFormState {
  qualification_name: string;
}

type FormErrors = Partial<Record<keyof QualificationFormState, string>>;

const DEFAULT_FORM_STATE: QualificationFormState = {
  qualification_name: '',
};

const validateForm = (formState: QualificationFormState): FormErrors => {
  const nextErrors: FormErrors = {};
  const qualificationName = formState.qualification_name.trim();

  if (!qualificationName) {
    nextErrors.qualification_name = '请输入资质名称';
  } else if (qualificationName.length < 2) {
    nextErrors.qualification_name = '资质名称至少 2 个字符';
  } else if (qualificationName.length > 100) {
    nextErrors.qualification_name = '资质名称不能超过 100 个字符';
  }

  return nextErrors;
};

const QualificationIcon: React.FC<{ name: QualificationIconName }> = ({ name }) => {
  const paths: Record<QualificationIconName, React.ReactNode> = {
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 12a8 8 0 0 1-13.5 5.8" />
        <path d="M4 12A8 8 0 0 1 17.5 6.2" />
        <path d="M17 3v4h-4" />
        <path d="M7 21v-4h4" />
      </>
    ),
  };

  return (
    <svg className="qualification-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
};

const QualificationTable: React.FC = () => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingQualification, setEditingQualification] = useState<Qualification | null>(null);
  const [searchText, setSearchText] = useState('');
  const [formState, setFormState] = useState<QualificationFormState>(DEFAULT_FORM_STATE);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchQualifications = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const response = await qualificationApi.getAll();
      setQualifications(response.data || []);
    } catch {
      setLoadError(true);
      wxbToast.error('获取资质数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQualifications();
  }, [fetchQualifications]);

  const resetForm = useCallback(() => {
    setFormState(DEFAULT_FORM_STATE);
    setFormErrors({});
  }, []);

  const handleAdd = useCallback(() => {
    setEditingQualification(null);
    resetForm();
    setModalVisible(true);
  }, [resetForm]);

  const handleEdit = useCallback((record: Qualification) => {
    setEditingQualification(record);
    setFormState({ qualification_name: record.qualification_name });
    setFormErrors({});
    setModalVisible(true);
  }, []);

  const handleDelete = useCallback(async (record: Qualification) => {
    if (!record.id) return;

    try {
      await qualificationApi.delete(record.id);
      wxbToast.success('删除成功');
      await fetchQualifications();
    } catch {
      wxbToast.error('删除失败');
    }
  }, [fetchQualifications]);

  const handleSubmit = useCallback(async () => {
    const nextErrors = validateForm(formState);
    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    const payload: Qualification = {
      qualification_name: formState.qualification_name.trim(),
    };

    setSubmitting(true);

    try {
      if (editingQualification?.id) {
        await qualificationApi.update(editingQualification.id, payload);
        wxbToast.success('更新成功');
      } else {
        await qualificationApi.create(payload);
        wxbToast.success('创建成功');
      }

      setModalVisible(false);
      setEditingQualification(null);
      resetForm();
      await fetchQualifications();
    } catch {
      wxbToast.error(editingQualification ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }, [editingQualification, fetchQualifications, formState, resetForm]);

  const handleCancel = useCallback(() => {
    if (submitting) return;

    setModalVisible(false);
    setEditingQualification(null);
    resetForm();
  }, [resetForm, submitting]);

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredQualifications = useMemo(() => {
    if (!normalizedSearch) return qualifications;

    return qualifications.filter((item) =>
      item.qualification_name.toLowerCase().includes(normalizedSearch),
    );
  }, [normalizedSearch, qualifications]);

  const columns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        key: 'id',
        width: 88,
        sorter: (a: Qualification, b: Qualification) => (a.id || 0) - (b.id || 0),
      },
      {
        title: '资质名称',
        dataIndex: 'qualification_name',
        key: 'qualification_name',
        sorter: (a: Qualification, b: Qualification) =>
          a.qualification_name.localeCompare(b.qualification_name),
      },
      {
        title: '操作',
        key: 'action',
        width: 148,
        render: (_: unknown, record: Qualification) => (
          <WxbTableActionCell
            actions={[
              { key: 'edit', label: '编辑', onClick: () => handleEdit(record) },
              {
                key: 'delete',
                label: '删除',
                variant: 'danger',
                disabled: !record.id,
                onClick: () => handleDelete(record),
                confirm: {
                  title: '确认删除',
                  description: `确定要删除资质【${record.qualification_name}】吗？删除后相关的人员资质和操作要求也会受到影响。`,
                  okText: '确定删除',
                  cancelText: '取消',
                },
              },
            ]}
          />
        ),
      },
    ],
    [handleDelete, handleEdit],
  );

  return (
    <WxbPageShell size="full" gap="lg" className="qualification-page">
      <WxbPageHeader
        eyebrow="Master Data"
        title="资质管理"
        description="维护人员能力资质字典，供人员资质矩阵、操作要求和排班求解复用。"
        meta={<WxbTag color="blue">共 {qualifications.length} 项</WxbTag>}
        actions={(
          <>
            <WxbButton type="button" variant="secondary" onClick={fetchQualifications} disabled={loading}>
              <QualificationIcon name="refresh" />
              {loading ? '刷新中...' : '刷新'}
            </WxbButton>
            <WxbButton type="button" variant="primary" onClick={handleAdd}>
              <QualificationIcon name="plus" />
              新增资质
            </WxbButton>
          </>
        )}
      />

      <WxbPageSection variant="framed" density="compact" className="qualification-section">
        <WxbFilterBar
          search={{
            value: searchText,
            onChange: setSearchText,
            placeholder: '搜索资质名称',
            width: 320,
          }}
          resultCount={filteredQualifications.length}
          resultLabel="项资质"
        />

        <WxbDataTable<Qualification>
          density="compact"
          columns={columns}
          dataSource={filteredQualifications}
          rowKey="id"
          loading={loading}
          emptyState={{
            description: searchText ? '未找到匹配资质' : '暂无资质数据',
            action: searchText ? (
              <WxbButton type="button" variant="secondary" size="sm" onClick={() => setSearchText('')}>
                清除搜索
              </WxbButton>
            ) : (
              <WxbButton type="button" variant="primary" size="sm" onClick={handleAdd}>
                新增资质
              </WxbButton>
            ),
          }}
          errorState={loadError ? {
            title: '资质数据加载失败',
            description: '请检查后端服务或稍后重试。',
            action: (
              <WxbButton type="button" variant="secondary" size="sm" onClick={fetchQualifications}>
                重新加载
              </WxbButton>
            ),
          } : undefined}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
            pageSize: 10,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 640 }}
        />
      </WxbPageSection>

      <WxbModal
        title={editingQualification ? '编辑资质' : '新增资质'}
        open={modalVisible}
        onCancel={handleCancel}
        onOk={handleSubmit}
        okText={editingQualification ? '保存修改' : '创建资质'}
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
      >
        <form
          className="qualification-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <WxbInput
            label="资质名称"
            value={formState.qualification_name}
            placeholder="请输入资质名称，如：操作员证书、安全证书等"
            error={formErrors.qualification_name}
            onChange={(event) => {
              setFormState({ qualification_name: event.target.value });
              if (formErrors.qualification_name) {
                setFormErrors({});
              }
            }}
            autoFocus
          />
        </form>
      </WxbModal>
    </WxbPageShell>
  );
};

export default QualificationTable;
