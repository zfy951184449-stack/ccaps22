import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
    WxbBadge,
    WxbButton,
    WxbDatePicker,
    WxbEmpty,
    WxbIcon,
    WxbInput,
    WxbInputNumber,
    WxbModal,
    WxbSegmented,
    WxbSelect,
    wxbToast,
} from '../wxb-ui';
import { batchPlanApi } from '../../services/api';
import type { BatchTemplateSummary, MfgTemplatePackageSummary } from '../../types';

interface BulkCreateModalV4Props {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    templates?: BatchTemplateSummary[];
    mfgPackages?: MfgTemplatePackageSummary[];
}

interface BulkCreateValues {
    source_kind: 'template' | 'package';
    template_id?: number;
    mfg_package_id?: number;
    start_date?: Dayjs;
    batch_count: number;
    interval_days: number;
    batch_prefix: string;
    start_number: number;
    batch_number_length: number;
}

type BulkCreateErrors = Partial<Record<keyof BulkCreateValues, string>>;

const PREVIEW_LIMIT = 50;

const defaultBulkValues = (): BulkCreateValues => ({
    source_kind: 'template',
    template_id: undefined,
    mfg_package_id: undefined,
    start_date: undefined,
    batch_count: 4,
    interval_days: 7,
    batch_prefix: 'GMP',
    start_number: 1,
    batch_number_length: 3,
});

const getLastDay0Date = (values: BulkCreateValues) => {
    if (!values.start_date || !values.batch_count || !values.interval_days) {
        return undefined;
    }

    return dayjs(values.start_date).add((values.batch_count - 1) * values.interval_days, 'day');
};

const buildPreview = (values: BulkCreateValues) => {
    if (!values.start_date || !values.batch_count || !values.interval_days || !values.batch_prefix.trim()) {
        return [];
    }

    const list: Array<{ code: string; date: string; name: string }> = [];
    let current = dayjs(values.start_date);
    let num = values.start_number || 1;

    for (let index = 0; index < values.batch_count && list.length < PREVIEW_LIMIT; index += 1) {
        const numStr = String(num).padStart(values.batch_number_length || 3, '0');
        const code = `${values.batch_prefix.trim()}${numStr}`;

        list.push({
            code,
            date: current.format('YYYY-MM-DD'),
            name: `${code} (Bulk)`,
        });

        current = current.add(values.interval_days, 'day');
        num += 1;
    }

    return list;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const responseData = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
    const message = responseData?.error ?? responseData?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
};

const BulkCreateModalV4: React.FC<BulkCreateModalV4Props> = ({
    visible,
    onCancel,
    onSuccess,
    templates: templateOptions,
    mfgPackages = [],
}) => {
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<BatchTemplateSummary[]>(templateOptions ?? []);
    const [values, setValues] = useState<BulkCreateValues>(defaultBulkValues);
    const [errors, setErrors] = useState<BulkCreateErrors>({});

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

        setValues(defaultBulkValues());
        setErrors({});
    }, [visible]);

    const previewList = useMemo(() => buildPreview(values), [values]);
    const lastDay0Date = useMemo(() => getLastDay0Date(values), [values]);
    const selectedPackage = useMemo(
        () => mfgPackages.find((item) => item.id === values.mfg_package_id) ?? null,
        [mfgPackages, values.mfg_package_id],
    );
    const packageModuleCount = Math.max(selectedPackage?.module_count ?? 1, 1);
    const generatedBatchCount = values.source_kind === 'package'
        ? values.batch_count * packageModuleCount
        : values.batch_count;

    const updateValue = useCallback(<K extends keyof BulkCreateValues>(
        key: K,
        value: BulkCreateValues[K],
    ) => {
        setValues((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    }, []);

    const validate = useCallback(() => {
        const nextErrors: BulkCreateErrors = {};

        if (values.source_kind === 'template' && !values.template_id) {
            nextErrors.template_id = '请选择模板';
        }
        if (values.source_kind === 'package' && !values.mfg_package_id) {
            nextErrors.mfg_package_id = '请选择总包';
        }
        if (!values.start_date) {
            nextErrors.start_date = values.source_kind === 'package' ? '请选择总包基准开始日期' : '请选择 Day0 开始日期';
        }
        if (!values.batch_count || values.batch_count < 1) {
            nextErrors.batch_count = '批次数量必须大于 0';
        }
        if (!values.interval_days || values.interval_days < 1) {
            nextErrors.interval_days = '间隔必须大于 0';
        }
        if (!values.batch_prefix.trim()) {
            nextErrors.batch_prefix = '请输入前缀';
        }
        if (!values.start_number || values.start_number < 1) {
            nextErrors.start_number = '起始序号必须大于 0';
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }, [values]);

    const handleSubmit = useCallback(async () => {
        const day0EndDate = getLastDay0Date(values);
        if (!validate() || !values.start_date || !day0EndDate) {
            return;
        }

        setLoading(true);
        try {
            const commonPayload = {
                interval_days: values.interval_days,
                batch_prefix: values.batch_prefix.trim(),
                start_number: values.start_number,
                batch_number_length: values.batch_number_length,
            };

            const result = values.source_kind === 'package'
                ? await batchPlanApi.createBulkFromPackage({
                    ...commonPayload,
                    mfg_package_id: Number(values.mfg_package_id),
                    base_start_date: values.start_date.format('YYYY-MM-DD'),
                    base_end_date: day0EndDate.format('YYYY-MM-DD'),
                })
                : await batchPlanApi.createBulk({
                    ...commonPayload,
                    template_id: Number(values.template_id),
                    day0_start_date: values.start_date.format('YYYY-MM-DD'),
                    day0_end_date: day0EndDate.format('YYYY-MM-DD'),
                });

            wxbToast.success(result.message || '批量创建成功');
            onSuccess();
        } catch (error) {
            console.error('Failed to bulk create batches', error);
            wxbToast.error(getApiErrorMessage(error, '批量创建失败'));
        } finally {
            setLoading(false);
        }
    }, [onSuccess, validate, values]);

    return (
        <WxbModal
            open={visible}
            title="批量创建批次"
            footer={null}
            onCancel={onCancel}
            width={920}
            centered
        >
            <div className="batch-modal-v4__bulk-layout">
                <div className="batch-modal-v4__bulk-config">
                    <div className="batch-modal-v4__body">
                        <p className="batch-modal-v4__intro">
                            设定工艺模板或 MFG 总包、起始日期、批次数量和命名规则；总包会按模板模块拆成各部门独立批次。
                        </p>

                        <div className="batch-modal-v4__section">
                            <h3 className="batch-modal-v4__section-title">生产规则</h3>
                            <WxbSegmented
                                size="md"
                                value={values.source_kind}
                                onChange={(value) => {
                                    const sourceKind = value as BulkCreateValues['source_kind'];
                                    updateValue('source_kind', sourceKind);
                                    updateValue(sourceKind === 'template' ? 'mfg_package_id' : 'template_id', undefined);
                                }}
                                options={[
                                    { label: '工艺模板', value: 'template', icon: <WxbIcon name="recipe" size={14} /> },
                                    { label: 'MFG 总包', value: 'package', icon: <WxbIcon name="batch-record" size={14} /> },
                                ]}
                            />
                            {values.source_kind === 'template' ? (
                                <WxbSelect
                                    label="工艺模板"
                                    placeholder="选择标准生产流程"
                                    value={values.template_id}
                                    error={errors.template_id}
                                    options={templates.map((template) => ({
                                        label: template.template_name,
                                        value: template.id,
                                    }))}
                                    onChange={(value) => updateValue('template_id', value as number)}
                                />
                            ) : (
                                <WxbSelect
                                    label="MFG 总包"
                                    placeholder="选择已设计的生产联动总包"
                                    value={values.mfg_package_id}
                                    error={errors.mfg_package_id}
                                    options={mfgPackages.map((item) => ({
                                        label: `${item.package_code} · ${item.package_name}`,
                                        value: item.id,
                                    }))}
                                    onChange={(value) => updateValue('mfg_package_id', value as number)}
                                />
                            )}
                            <div className="batch-modal-v4__grid">
                                <WxbDatePicker
                                    label={values.source_kind === 'package' ? '总包基准日期开始' : 'Day0 开始日期'}
                                    value={values.start_date as any}
                                    error={errors.start_date}
                                    onChange={(date) => updateValue('start_date', (date as Dayjs | null) || undefined)}
                                />
                                <WxbInputNumber
                                    label="批次数量"
                                    min={1}
                                    precision={0}
                                    value={values.batch_count}
                                    error={errors.batch_count}
                                    addonAfter="批"
                                    onChange={(value) => updateValue('batch_count', Number(value) || 1)}
                                />
                            </div>
                            <WxbInputNumber
                                label="生成间隔"
                                min={1}
                                precision={0}
                                value={values.interval_days}
                                error={errors.interval_days}
                                addonBefore="每"
                                addonAfter="天"
                                onChange={(value) => updateValue('interval_days', Number(value) || 1)}
                            />
                            {lastDay0Date && previewList.length > 0 && (
                                <p className="batch-modal-v4__rule-note">
                                    {values.source_kind === 'package'
                                        ? `将生成 ${values.batch_count} 组总包基准批次，每组拆成 ${packageModuleCount} 个部门批次，共 ${generatedBatchCount} 个批次，最后一个总包基准日期为 ${lastDay0Date.format('YYYY-MM-DD')}。`
                                        : `将生成 ${values.batch_count} 个批次，最后一个 Day0 为 ${lastDay0Date.format('YYYY-MM-DD')}。`}
                                </p>
                            )}
                        </div>

                        <div className="batch-modal-v4__section">
                            <h3 className="batch-modal-v4__section-title">命名规则</h3>
                            <div className="batch-modal-v4__grid">
                                <WxbInput
                                    label="前缀"
                                    placeholder="GMP"
                                    value={values.batch_prefix}
                                    error={errors.batch_prefix}
                                    onChange={(event) => updateValue('batch_prefix', event.target.value)}
                                />
                                <WxbInputNumber
                                    label="起始序号"
                                    min={1}
                                    value={values.start_number}
                                    error={errors.start_number}
                                    onChange={(value) => updateValue('start_number', Number(value) || 1)}
                                />
                            </div>
                            <WxbSelect
                                label="序号长度"
                                value={values.batch_number_length}
                                options={[
                                    { label: '3位 (001)', value: 3 },
                                    { label: '4位 (0001)', value: 4 },
                                ]}
                                onChange={(value) => updateValue('batch_number_length', value as number)}
                            />
                        </div>
                    </div>
                </div>

                <div className="batch-modal-v4__bulk-preview">
                    <div className="batch-modal-v4__preview-header">
                        <h3 className="batch-modal-v4__preview-title">预览</h3>
                        <WxbBadge
                            status="success"
                            variant="outline"
                            code="COUNT"
                            label={previewList.length > 0 ? `${generatedBatchCount}` : '0'}
                        />
                    </div>

                    <div className="batch-modal-v4__preview-list">
                        {previewList.length > 0 ? (
                            <>
                                {previewList.map((item) => (
                                    <div key={`${item.code}-${item.date}`} className="batch-modal-v4__preview-card">
                                        <div>
                                            <div className="batch-modal-v4__preview-code">{item.code}</div>
                                            <div className="batch-modal-v4__preview-date">
                                                <WxbIcon name="hold-time" size={13} />
                                                {item.date}
                                            </div>
                                        </div>
                                        <WxbIcon name="batch-record" size={18} />
                                    </div>
                                ))}
                                {values.batch_count > PREVIEW_LIMIT && (
                                    <div className="batch-modal-v4__preview-note">
                                        仅显示前 50 个{values.source_kind === 'package' ? '总包基准批次' : '批次'}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="batch-modal-v4__preview-empty">
                                <WxbEmpty
                                    image={<WxbIcon name="batch-record" size={52} />}
                                    description="配置规则以查看预览"
                                />
                            </div>
                        )}
                    </div>

                    <div className="batch-modal-v4__actions">
                        <WxbButton type="button" variant="ghost" onClick={onCancel}>
                            取消
                        </WxbButton>
                        <WxbButton
                            type="button"
                            variant="primary"
                            disabled={loading || previewList.length === 0}
                            aria-busy={loading || undefined}
                            onClick={handleSubmit}
                        >
                            {loading ? '生成中...' : '生成批次'}
                        </WxbButton>
                    </div>
                </div>
            </div>
        </WxbModal>
    );
};

export default BulkCreateModalV4;
