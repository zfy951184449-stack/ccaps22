import { useMemo, useState } from 'react'
import { Layout, Menu, Breadcrumb, Avatar, Dropdown, Space, Typography, Button } from 'antd'
import {
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
  BranchesOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const menuItems: MenuProps['items'] = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: '仪表盘'
  },
  {
    key: '/templates',
    icon: <BranchesOutlined />,
    label: '工艺模板'
  },
  {
    key: '/personnel',
    icon: <TeamOutlined />,
    label: '人员与资质'
  }
]

const breadcrumbMap: Record<string, string[]> = {
  '/': ['仪表盘'],
  '/templates': ['工艺管理', '工艺模板'],
  '/personnel': ['人员管理', '人员与资质']
}

const AdminLayout = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const matchedKey = useMemo(() => {
    const path = location.pathname
    const match = Object.keys(breadcrumbMap)
      .sort((a, b) => b.length - a.length)
      .find((key) => path === key || path.startsWith(`${key}/`))
    return match ?? '/'
  }, [location.pathname])

  const breadcrumbs = breadcrumbMap[matchedKey] ?? ['仪表盘']

  const userMenu: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <SettingOutlined />,
      label: '账号设置'
    },
    {
      type: 'divider'
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => navigate('/login')
    }
  ]

  return (
    <Layout>
      <Sider collapsible collapsed={collapsed} width={220} trigger={null} theme="light">
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 600,
            fontSize: 16
          }}
        >
          {collapsed ? 'APS' : 'APS 管理后台'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[matchedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInline: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#ffffff',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((prev) => !prev)}
            />
            <Breadcrumb items={breadcrumbs.map((title) => ({ title }))} separator=">" />
          </Space>

          <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={['click']}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size={36} style={{ backgroundColor: '#1677ff' }}>
                管理
              </Avatar>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <Text strong>系统管理员</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  admin@example.com
                </Text>
              </div>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f6fa' }}>
          <div
            style={{
              padding: 24,
              background: '#ffffff',
              minHeight: 'calc(100vh - 180px)',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default AdminLayout
