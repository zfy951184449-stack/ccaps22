import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, DatePicker, Select, Button, message, Typography, Row, Col, Divider, Card, Tag, Space } from 'antd';
import dayjs from 'dayjs';
import { batchPlanApi } from '../../services/api';
import type { BatchPlan, BatchTemplateSummary } from '../../types';
import { InfoCircleFilled, RocketOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface CreateBatchModalV4Props {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    initialValues?: BatchPlan | null; // For editing
    templates?: BatchTemplateSummary[];
}

const CreateBatchModalV4: React.FC<CreateBatchModalV4Props> = ({
    visible,
    onCancel,
    onSuccess,
    initialValues,
    templates: templateOptions
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<BatchTemplateSummary[]>(templateOptions ?? []);

    const [day0Offset, setDay0Offset] = useState<{ offset: number; has_pre_day0: boolean; pre_day0_count: number } | null>(null);

    useEffect(() => {
        if (templateOptions && templateOptions.length > 0) {
            setTemplates(templateOptions);
            return;
        }

        if (!visible) {
            return;
        }

        batchPlanApi.getTemplates().then(setTemplates).catch(console.error);
    }, [templateOptions, visible]);

    useEffect(() => {
        if (visible) {
            form.resetFields();
            setDay0Offset(null);

            if (initialValues) {
                form.setFieldsValue({
                    ...initialValues,
                    planned_start_date: dayjs(initialValues.planned_start_date)
                });
                if (initialValues.template_id) {
                    handleTemplateChange(initialValues.template_id);
                }
            } else {
                form.setFieldsValue({
                    plan_status: 'DRAFT',
                    planned_start_date: dayjs(),
                });
            }
        }
    }, [form, initialValues, visible]);

    const handleTemplateChange = async (templateId: number) => {
        try {
            const data = await batchPlanApi.getTemplateDay0Offset(templateId);
            setDay0Offset(data);
        } catch (err) {
            console.warn('Failed to load template offset', err);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            // Offset calculation
            let actualStartDate = values.planned_start_date;
            if (day0Offset && day0Offset.offset < 0) {
                actualStartDate = values.planned_start_date.add(day0Offset.offset, 'day');
            }

            const payload = {
                ...values,
                planned_start_date: actualStartDate.format('YYYY-MM-DD'),
            };

            if (initialValues) {
                await batchPlanApi.update(initialValues.id, payload);
                message.success('批次已更新');
            } else {
                await batchPlanApi.create(payload);
                message.success('批次已创建');
            }
            onSuccess();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={visible}
            title={null}
            footer={null}
            onCancel={onCancel}
            width={520}
            centered
            className="glass-modal-single"
            styles={{
                content: {
                    borderRadius: '24px',
                    padding: '0',
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                },
                body: { padding: 0 }
            }}
        >
            <div style={{ padding: '32px' }}>
                <Title level={3} style={{ marginBottom: 8, textAlign: 'center' }}>
                    {initialValues ? "编辑批次" : "新建生产批次"}
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 32, textAlign: 'center' }}>
                    请填写以下信息以启动新的生产计划
                </Text>

                <Form form={form} layout="vertical">

                    {/* Section 1: Template */}
                    <Card bordered={false} style={{
                        background: 'rgba(240, 242, 245, 0.5)',
                        borderRadius: '16px',
                        marginBottom: '24px'
                    }}>
                        <Form.Item
                            label={<span style={{ fontWeight: 600 }}>工艺模板</span>}
                            name="template_id"
                            rules={[{ required: true, message: '请选择模板' }]}
                            style={{ margin: 0 }}
                        >
                            <Select
                                placeholder="选择一个标准生产流程"
                                size="large"
                                onChange={handleTemplateChange}
                                options={templates.map(t => ({ label: t.template_name, value: t.id }))}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Card>

                    {/* Section 2: Schedule */}
                    <div style={{ marginBottom: '24px' }}>
                        <Form.Item
                            label={<span style={{ fontWeight: 600 }}>基准日期 (Day 0)</span>}
                            name="planned_start_date"
                            rules={[{ required: true, message: '请选择日期' }]}
                            style={{ marginBottom: day0Offset?.has_pre_day0 ? 12 : 0 }}
                        >
                            <DatePicker size="large" style={{ width: '100%' }} format="YYYY-MM-DD" />
                        </Form.Item>

                        {day0Offset && day0Offset.has_pre_day0 && (
                            <div style={{
                                background: '#E6F7FF',
                                border: '1px solid #91D5FF',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px'
                            }}>
                                <InfoCircleFilled style={{ color: '#1890FF', marginTop: 4 }} />
                                <div>
                                    <Text strong style={{ color: '#0050B3' }}>提前投料提醒</Text>
                                    <div style={{ fontSize: '13px', color: '#003A8C', marginTop: 2 }}>
                                        该模板包含提前 {day0Offset.pre_day0_count} 天的操作。
                                        实际开始日期将自动调整为: <span style={{ fontWeight: 700 }}>{
                                            form.getFieldValue('planned_start_date')?.add(day0Offset.offset, 'day')?.format('YYYY-MM-DD') ?? '-'
                                        }</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <Divider style={{ margin: '24px 0' }} />

                    {/* Section 3: Identity & Status */}
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                label={<span style={{ fontWeight: 600 }}>批次代码</span>}
                                name="batch_code"
                                rules={[{ required: true }]}
                            >
                                <Input size="large" placeholder="BATCH-001" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                label={<span style={{ fontWeight: 600 }}>状态</span>}
                                name="plan_status"
                            >
                                <Select size="large" options={[
                                    { label: <Space><Tag>DRAFT</Tag> 草稿</Space>, value: 'DRAFT' },
                                    { label: <Space><RocketOutlined /> 已激活</Space>, value: 'ACTIVATED' }
                                ]} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item
                        label={<span style={{ fontWeight: 600 }}>批次名称</span>}
                        name="batch_name"
                        rules={[{ required: true }]}
                        style={{ marginBottom: 0 }}
                    >
                        <Input size="large" placeholder="输入易于识别的名称" />
                    </Form.Item>

                </Form>

                <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button size="large" onClick={onCancel} style={{ borderRadius: '12px', padding: '0 32px' }}>
                        取消
                    </Button>
                    <Button
                        type="primary"
                        size="large"
                        onClick={handleSubmit}
                        loading={loading}
                        style={{
                            borderRadius: '12px',
                            padding: '0 32px',
                            background: '#000', // Apple style black button
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}
                    >
                        {initialValues ? '保存更改' : '立即创建'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateBatchModalV4;
