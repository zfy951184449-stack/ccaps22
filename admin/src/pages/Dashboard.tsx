import { Card, Col, Row, Statistic, Typography } from 'antd'
import { CalendarOutlined, ProfileOutlined, TeamOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography

const DashboardPage = () => {
  return (
    <div>
      <Title level={3}>欢迎回来</Title>
      <Paragraph type="secondary">
        在这里可以集中管理工艺模板、人员资质、排班策略以及系统运行状况。
      </Paragraph>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已定义工艺模板"
              value={26}
              prefix={<ProfileOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="激活批次" value={8} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="可用人员" value={132} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="待处理告警" value={3} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="近期任务" bordered={false}>
            <Paragraph>• 校验 2025-Q2 工艺模板版本差异</Paragraph>
            <Paragraph>• 复核夜班人员资质覆盖情况</Paragraph>
            <Paragraph>• 跟进自动排班测试反馈</Paragraph>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="接入计划" bordered={false}>
            <Paragraph>• 接入节假日双路兜底服务</Paragraph>
            <Paragraph>• T+1 排班优化算法试运行</Paragraph>
            <Paragraph>• 管理后台角色/权限配置</Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default DashboardPage
