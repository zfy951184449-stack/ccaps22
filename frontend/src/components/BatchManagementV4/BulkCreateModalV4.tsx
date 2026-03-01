import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, DatePicker, Select, InputNumber, message, Row, Col, Card, Typography, Space, Divider, Badge, Button } from 'antd';
import { batchPlanApi } from '../../services/api';
import type { BatchTemplateSummary } from '../../types';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface BulkCreateModalV4Props {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    templates?: BatchTemplateSummary[];
}

const BulkCreateModalV4: React.FC<BulkCreateModalV4Props> = ({ visible, onCancel, onSuccess, templates: templateOptions }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<BatchTemplateSummary[]>(templateOptions ?? []);

    // Preview state
    const [previewList, setPreviewList] = useState<Array<{ code: string; date: string; name: string }>>([]);

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
            form.setFieldsValue({
                interval_days: 7,
                start_number: 1,
                batch_number_length: 3,
                batch_prefix: 'GMP'
            });
            setPreviewList([]);
        }
    }, [form, visible]);

    const updatePreview = () => {
        const values = form.getFieldsValue();
        if (values.date_range && values.interval_days && values.batch_prefix) {
            const [start, end] = values.date_range;
            if (!start || !end) return;

            const list: Array<{ code: string; date: string; name: string }> = [];
            let current = dayjs(start);
            const endDate = dayjs(end);
            let num = values.start_number || 1;

            // Limit preview to e.g. 50 items to avoid freezing on massive ranges
            while ((current.isBefore(endDate) || current.isSame(endDate, 'day')) && list.length < 50) {
                const numStr = String(num).padStart(values.batch_number_length || 3, '0');
                const code = `${values.batch_prefix}${numStr}`;

                list.push({
                    code,
                    date: current.format('YYYY-MM-DD'),
                    name: `${code} (Bulk)`
                });

                current = current.add(values.interval_days, 'day');
                num++;
            }
            setPreviewList(list);
        } else {
            setPreviewList([]);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const payload = {
                template_id: values.template_id,
                day0_start_date: values.date_range[0].format('YYYY-MM-DD'),
                day0_end_date: values.date_range[1].format('YYYY-MM-DD'),
                interval_days: values.interval_days,
                batch_prefix: values.batch_prefix,
                start_number: values.start_number,
                // Add padding handling in backend if needed, or assume backend handles formatting
                // For now backend likely just concatenates, so we match logic
            };

            const result = await batchPlanApi.createBulk(payload);
            message.success(result.message || '批量创建成功');
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
            title={null} // Custom header
            footer={null} // Custom footer
            onCancel={onCancel}
            width={900}
            centered
            className="glass-modal-bulk"
            styles={{
                content: {
                    borderRadius: '24px',
                    padding: '0',
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
                },
                body: { padding: 0 }
            }}
        >
            <div style={{ display: 'flex', height: '600px' }}>
                {/* Left Side: Configuration */}
                <div style={{ flex: 1, padding: '32px', borderRight: '1px solid rgba(0,0,0,0.06)', overflowY: 'auto' }}>
                    <Title level={3} style={{ marginBottom: 8 }}>批量创建批次</Title>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>设定规则以自动快速生成生产计划</Text>

                    <Form
                        form={form}
                        layout="vertical"
                        onValuesChange={updatePreview}
                    >
                        <Form.Item
                            label="工艺模板"
                            name="template_id"
                            rules={[{ required: true }]}
                        >
                            <Select
                                placeholder="选择标准生产流程"
                                size="large"
                                options={templates.map(t => ({ label: t.template_name, value: t.id }))}
                            />
                        </Form.Item>

                        <div style={{ background: 'rgba(0,0,0,0.02)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
                            <Form.Item
                                label="Day0 日期范围"
                                name="date_range"
                                rules={[{ required: true }]}
                                style={{ marginBottom: 16 }}
                            >
                                <RangePicker size="large" style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                label="生成间隔"
                                name="interval_days"
                                rules={[{ required: true }]}
                                style={{ marginBottom: 0 }}
                                help="每隔多少天开始一个新的批次"
                            >
                                <InputNumber
                                    min={1}
                                    size="large"
                                    addonBefore="每"
                                    addonAfter="天"
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        </div>

                        <Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>命名规则</Title>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="前缀"
                                    name="batch_prefix"
                                    rules={[{ required: true }]}
                                >
                                    <Input size="large" placeholder="GMP" prefix={<span style={{ color: '#ccc' }}>Tx</span>} />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="起始序号"
                                    name="start_number"
                                    rules={[{ required: true }]}
                                >
                                    <InputNumber size="large" min={1} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item label="序号长度" name="batch_number_length">
                            <Select size="large" options={[
                                { label: '3位 (001)', value: 3 },
                                { label: '4位 (0001)', value: 4 },
                            ]} />
                        </Form.Item>
                    </Form>
                </div>

                {/* Right Side: Preview */}
                <div style={{ width: '380px', background: 'rgba(240, 242, 245, 0.4)', padding: '32px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={4} style={{ margin: 0 }}>预览</Title>
                        <Badge count={previewList.length} style={{ backgroundColor: '#52c41a' }} />
                    </div>

                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        paddingRight: '4px',
                        maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
                    }}>
                        {previewList.length > 0 ? (
                            <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                {previewList.map((item, index) => (
                                    <Card
                                        key={index}
                                        size="small"
                                        bordered={false}
                                        style={{
                                            borderRadius: '12px',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <Text strong style={{ fontSize: '15px', color: '#007AFF' }}>{item.code}</Text>
                                                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                                                    <CalendarOutlined style={{ marginRight: 4 }} />
                                                    {item.date}
                                                </div>
                                            </div>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#52c41a' }}></div>
                                        </div>
                                    </Card>
                                ))}
                                {previewList.length === 50 && (
                                    <Text type="secondary" style={{ textAlign: 'center', display: 'block', fontSize: '12px' }}>
                                        显示前 50 个...
                                    </Text>
                                )}
                            </Space>
                        ) : (
                            <div style={{
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ccc',
                                flexDirection: 'column'
                            }}>
                                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📝</div>
                                <div>配置规则以查看预览</div>
                            </div>
                        )}
                    </div>

                    <Divider style={{ margin: '16px 0' }} />

                    <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                        <Button size="large" onClick={onCancel} style={{ borderRadius: '12px' }}>取消</Button>
                        <Button
                            type="primary"
                            size="large"
                            onClick={handleSubmit}
                            loading={loading}
                            disabled={previewList.length === 0}
                            style={{
                                borderRadius: '12px',
                                background: '#007AFF',
                                boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)'
                            }}
                        >
                            生成批次
                        </Button>
                    </Space>
                </div>
            </div>
        </Modal>
    );
};

export default BulkCreateModalV4;
