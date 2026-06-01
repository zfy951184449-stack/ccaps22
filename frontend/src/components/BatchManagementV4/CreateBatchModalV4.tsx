import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
    WxbDatePicker,
    WxbIcon,
    WxbInput,
    WxbModal,
    WxbSegmented,
    WxbSelect,
    wxbToast,
} from '../wxb-ui';
import { batchPlanApi } from '../../services/api';
import type { BatchPlan, BatchTemplateSummary, MfgTemplatePackageSummary } from '../../types';

interface CreateBatchModalV4Props {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    initialValues?: BatchPlan | null;
    templates?: BatchTemplateSummary[];
    mfgPackages?: MfgTemplatePackageSummary[];
}

interface CreateBatchFormValues {
    source_kind: 'template' | 'package';
    template_id?: number;
    mfg_package_id?: number;
    planned_start_date: Dayjs;
    batch_code: string;
    batch_name: string;
    plan_status: BatchPlan['plan_status'];
}

type CreateBatchErrors = Partial<Record<keyof CreateBatchFormValues, string>>;

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const responseData = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
    const message = responseData?.error ?? responseData?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
};

const createDefaultValues = (): CreateBatchFormValues => ({
    source_kind: 'template',
    template_id: undefined,
    mfg_package_id: undefined,
    planned_start_date: dayjs(),
    batch_code: '',
    batch_name: '',
    plan_status: 'DRAFT',
});

const CreateBatchModalV4: React.FC<CreateBatchModalV4Props> = ({
    visible,
    onCancel,
    onSuccess,
    initialValues,
    templates: templateOptions,
    mfgPackages = [],
}) => {
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<BatchTemplateSummary[]>(templateOptions ?? []);
    const [values, setValues] = useState<CreateBatchFormValues>(createDefaultValues);
    const [errors, setErrors] = useState<CreateBatchErrors>({});
    const [day0Offset, setDay0Offset] = useState<{ offset: number; has_pre_day0: boolean; pre_day0_count: number } | null>(null);

    const handleTemplateChange = useCallback(async (templateId?: number) => {
        if (!templateId) {
            setDay0Offset(null);
            return;
        }

        try {
            const data = await batchPlanApi.getTemplateDay0Offset(templateId);
            setDay0Offset(data);
        } catch (error) {
            console.warn('Failed to load template offset', error);
            setDay0Offset(null);
        }
    }, []);

    useEffect(() => {
        if (templateOptions && templateOptions.length > 0) {
            setTemplates(templateOptions);
            return;
        }

        if (!visible) {
            return;
        }

        batchPlanApi.getTemplates().then(setTemplates).catch((error) => {
            console.error('Failed to load templates', error);
            wxbToast.error('加载工艺模板失败');
        });
    }, [templateOptions, visible]);

    useEffect(() => {
        if (!visible) {
            return;
        }

        setErrors({});
        setDay0Offset(null);

        if (initialValues) {
            const nextValues: CreateBatchFormValues = {
                source_kind: initialValues.mfg_package_id ? 'package' : 'template',
                template_id: initialValues.template_id,
                mfg_package_id: initialValues.mfg_package_id ?? undefined,
                planned_start_date: initialValues.planned_start_date ? dayjs(initialValues.planned_start_date) : dayjs(),
                batch_code: initialValues.batch_code,
                batch_name: initialValues.batch_name,
                plan_status: initialValues.plan_status,
            };
            setValues(nextValues);
            handleTemplateChange(initialValues.template_id);
            return;
        }

        setValues(createDefaultValues());
    }, [handleTemplateChange, initialValues, visible]);

    const actualStartPreview = useMemo(() => {
        if (!day0Offset || day0Offset.offset >= 0) {
            return null;
        }
        return values.planned_start_date.add(day0Offset.offset, 'day').format('YYYY-MM-DD');
    }, [day0Offset, values.planned_start_date]);

    const selectedPackage = useMemo(
        () => mfgPackages.find((item) => item.id === values.mfg_package_id) ?? null,
        [mfgPackages, values.mfg_package_id],
    );

    const updateValue = useCallback(<K extends keyof CreateBatchFormValues>(
        key: K,
        value: CreateBatchFormValues[K],
    ) => {
        setValues((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    }, []);

    const validate = useCallback(() => {
        const nextErrors: CreateBatchErrors = {};

        if (values.source_kind === 'template' && !values.template_id) {
            nextErrors.template_id = '请选择模板';
        }
        if (values.source_kind === 'package' && !values.mfg_package_id) {
            nextErrors.mfg_package_id = '请选择总包';
        }
        if (!values.planned_start_date?.isValid()) {
            nextErrors.planned_start_date = '请选择日期';
        }
        if (!values.batch_code.trim()) {
            nextErrors.batch_code = '请输入批次代码';
        }
        if (!values.batch_name.trim()) {
            nextErrors.batch_name = '请输入批次名称';
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }, [values]);

    const handleSubmit = useCallback(async () => {
        if (!validate()) {
            return;
        }

        setLoading(true);
        try {
            if (!initialValues && values.source_kind === 'package') {
                const result = await batchPlanApi.createFromPackage({
                    mfg_package_id: Number(values.mfg_package_id),
                    batch_code: values.batch_code.trim(),
                    batch_name: values.batch_name.trim(),
                    planned_start_date: values.planned_start_date.format('YYYY-MM-DD'),
                });
                wxbToast.success(result.message || '已按总包创建部门批次');
                onSuccess();
                return;
            }

            const templateId = values.template_id ?? initialValues?.template_id;
            if (!templateId) {
                wxbToast.error('请选择模板');
                return;
            }
            const actualStartDate = day0Offset && day0Offset.offset < 0
                ? values.planned_start_date.add(day0Offset.offset, 'day')
                : values.planned_start_date;

            const payload = {
                template_id: templateId,
                batch_code: values.batch_code.trim(),
                batch_name: values.batch_name.trim(),
                plan_status: values.plan_status,
                planned_start_date: actualStartDate.format('YYYY-MM-DD'),
            };

            if (initialValues) {
                await batchPlanApi.update(initialValues.id, payload);
                wxbToast.success('批次已更新');
            } else {
                await batchPlanApi.create(payload);
                wxbToast.success('批次已创建');
            }
            onSuccess();
        } catch (error) {
            console.error('Failed to save batch', error);
            wxbToast.error(getApiErrorMessage(error, initialValues ? '更新批次失败' : '创建批次失败'));
        } finally {
            setLoading(false);
        }
    }, [day0Offset, initialValues, onSuccess, validate, values]);

    return (
        <WxbModal
            open={visible}
            title={initialValues ? '编辑批次' : '新建生产批次'}
            okText={initialValues ? '保存更改' : '立即创建'}
            cancelText="取消"
            confirmLoading={loading}
            onOk={handleSubmit}
            onCancel={onCancel}
            width={560}
            centered
        >
            <div className="batch-modal-v4__body">
                <p className="batch-modal-v4__intro">
                    选择标准模板会生成单个批次；选择 MFG 总包会按包含的模板生成各部门独立批次。
                </p>

                <div className="batch-modal-v4__section">
                    <h3 className="batch-modal-v4__section-title">计划来源与日期</h3>
                    {!initialValues && (
                        <WxbSegmented
                            size="md"
                            value={values.source_kind}
                            onChange={(value) => {
                                const sourceKind = value as CreateBatchFormValues['source_kind'];
                                updateValue('source_kind', sourceKind);
                                setDay0Offset(null);
                            }}
                            options={[
                                { label: '工艺模板', value: 'template', icon: <WxbIcon name="recipe" size={14} /> },
                                { label: 'MFG 总包', value: 'package', icon: <WxbIcon name="batch-record" size={14} /> },
                            ]}
                        />
                    )}

                    {values.source_kind === 'template' ? (
                        <WxbSelect
                            label="工艺模板"
                            placeholder="选择一个标准生产流程"
                            value={values.template_id}
                            error={errors.template_id}
                            options={templates.map((template) => ({
                                label: template.template_name,
                                value: template.id,
                            }))}
                            onChange={(value) => {
                                const templateId = value as number;
                                updateValue('template_id', templateId);
                                handleTemplateChange(templateId);
                            }}
                        />
                    ) : (
                        <WxbSelect
                            label="MFG 总包"
                            placeholder="选择一个生产联动总包"
                            value={values.mfg_package_id}
                            error={errors.mfg_package_id}
                            disabled={Boolean(initialValues)}
                            options={mfgPackages.map((item) => ({
                                label: `${item.package_code} · ${item.package_name}`,
                                value: item.id,
                            }))}
                            onChange={(value) => updateValue('mfg_package_id', value as number)}
                        />
                    )}
                    <WxbDatePicker
                        label={values.source_kind === 'package' ? '总包基准日期 (Day 0)' : '基准日期 (Day 0)'}
                        format="YYYY-MM-DD"
                        value={values.planned_start_date}
                        error={errors.planned_start_date}
                        disabled={Boolean(initialValues?.mfg_package_id)}
                        onChange={(date) => updateValue('planned_start_date', (date ?? dayjs()) as Dayjs)}
                    />
                    {selectedPackage && (
                        <div className="batch-modal-v4__info" role="status">
                            <WxbIcon name="kanban" size={18} />
                            <div>
                                <div className="batch-modal-v4__warning-title">总包生成范围</div>
                                <p className="batch-modal-v4__warning-copy">
                                    {selectedPackage.package_name}
                                    {`，将生成 ${selectedPackage.module_count} 个部门批次`}
                                    {selectedPackage.total_days ? `，预计 ${selectedPackage.total_days} 天` : ''}
                                    {selectedPackage.min_day !== null && selectedPackage.min_day !== undefined
                                        ? `，覆盖 Day ${selectedPackage.min_day} 到 Day ${selectedPackage.max_day}`
                                        : ''}
                                </p>
                            </div>
                        </div>
                    )}
                    {day0Offset?.has_pre_day0 && (
                        <div className="batch-modal-v4__warning" role="status">
                            <WxbIcon name="oos-clock" size={18} />
                            <div>
                                <div className="batch-modal-v4__warning-title">提前投料提醒</div>
                                <p className="batch-modal-v4__warning-copy">
                                    该模板包含提前 {day0Offset.pre_day0_count} 天的操作。
                                    实际开始日期将自动调整为 {actualStartPreview ?? '-'}。
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="batch-modal-v4__section">
                    <h3 className="batch-modal-v4__section-title">批次身份</h3>
                    <div className="batch-modal-v4__grid">
                        <WxbInput
                            label="批次代码"
                            placeholder="BATCH-001"
                            value={values.batch_code}
                            error={errors.batch_code}
                            onChange={(event) => updateValue('batch_code', event.target.value)}
                        />
                        <WxbSelect
                            label="状态"
                            value={values.plan_status}
                            options={[
                                { label: '草稿', value: 'DRAFT' },
                                { label: '已激活', value: 'ACTIVATED' },
                            ]}
                            onChange={(value) => updateValue('plan_status', value as BatchPlan['plan_status'])}
                        />
                    </div>
                    <WxbInput
                        label="批次名称"
                        placeholder="输入易于识别的名称"
                        value={values.batch_name}
                        error={errors.batch_name}
                        onChange={(event) => updateValue('batch_name', event.target.value)}
                    />
                </div>
            </div>
        </WxbModal>
    );
};

export default CreateBatchModalV4;
