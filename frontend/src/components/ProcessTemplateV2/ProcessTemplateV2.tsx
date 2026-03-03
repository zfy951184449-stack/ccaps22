import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Typography, Row, Col, Tabs } from 'antd';
import ProcessTemplateResourceTimeline from './ProcessTemplateResourceTimeline';

export interface Team {
    id: number;
    unit_code: string;
    unit_name: string;
}

export interface Template {
    id: number;
    template_code: string;
    template_name: string;
    team_id: number | null;
    team_code: string | null;
    team_name: string | null;
    description: string;
    total_days: number;
    created_at: string;
    updated_at: string;
}

const ProcessTemplateV2: React.FC = () => {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [activeTeamId, setActiveTeamId] = useState<string>('all');

    const API_BASE_URL = 'http://localhost:3001/api';

    const fetchTeams = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/organization/teams`);
            setTeams(response.data);
        } catch (error) {
            console.error('Error fetching teams:', error);
        }
    }, []);

    const fetchTemplates = useCallback(async (teamId?: string) => {
        setLoading(true);
        try {
            const params = teamId && teamId !== 'all' ? { team_id: teamId } : {};
            const response = await axios.get(`${API_BASE_URL}/process-templates`, { params });
            setTemplates(response.data);
        } catch (error) {
            console.error('Error fetching templates:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTeams();
        fetchTemplates();
    }, [fetchTeams, fetchTemplates]);

    useEffect(() => {
        fetchTemplates(activeTeamId);
    }, [activeTeamId, fetchTemplates]);

    const tabItems = useMemo(() => [
        { key: 'all', label: `全部 (${templates.length})` },
        ...teams.map(t => ({ key: t.id.toString(), label: t.unit_name }))
    ], [teams, templates.length]);

    if (selectedTemplate) {
        return (
            <ProcessTemplateResourceTimeline
                template={selectedTemplate}
                onBack={() => setSelectedTemplate(null)}
            />
        );
    }

    return (
        <div className="h-full flex flex-col pt-2" style={{ minHeight: 'calc(100vh - 120px)' }}>
            <div className="bg-white/70 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm flex-1">
                <Row justify="space-between" align="middle" className="mb-6">
                    <Col>
                        <h1 className="text-2xl font-semibold text-gray-900 m-0">
                            工艺模版管理 V2 (Apple HIG)
                        </h1>
                    </Col>
                </Row>

                <Tabs
                    activeKey={activeTeamId}
                    onChange={setActiveTeamId}
                    items={tabItems}
                    className="mb-4"
                />

                {loading ? (
                    <div className="py-20 text-center text-gray-400">加载中...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {templates.map(template => (
                            <div
                                key={template.id}
                                onClick={() => setSelectedTemplate(template)}
                                className="group relative bg-white border border-gray-100 p-6 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <span className="inline-block px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg mb-2">
                                            {template.template_code}
                                        </span>
                                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                            {template.template_name}
                                        </h3>
                                    </div>
                                </div>
                                <p className="text-gray-500 text-sm line-clamp-2 h-10">
                                    {template.description || '无描述'}
                                </p>
                                <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center text-sm text-gray-500">
                                    <span>总天数: <strong className="text-gray-900">{template.total_days} 天</strong></span>
                                    <span>{template.team_name || '未分配'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProcessTemplateV2;
