import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Form, Input, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import './Login.css'

const { Title, Text } = Typography

const LoginPage = () => {
  const navigate = useNavigate()

  const handleFinish = () => {
    navigate('/')
  }

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <div className="login-header">
          <Title level={3}>APS 管理后台</Title>
          <Text type="secondary">请输入管理员账号密码以继续</Text>
        </div>
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item
            name="username"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="admin" autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item>
            <div className="login-options">
              <Checkbox>记住我</Checkbox>
              <Button type="link" className="login-link">
                忘记密码？
              </Button>
            </div>
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}

export default LoginPage
