#!/bin/bash

echo "🚀 启动APS系统管理界面..."

# 统一监听所有网卡以便局域网访问
export HOST=0.0.0.0

# 检查MySQL服务状态
echo "📊 检查MySQL服务状态..."
if ! brew services list | grep -q "mysql.*started"; then
    echo "⚠️  MySQL服务未启动，正在启动..."
    brew services start mysql
    sleep 3
fi

# 安装后端依赖
if [ ! -d "backend/node_modules" ]; then
    echo "📦 安装后端依赖..."
    cd backend
    npm install
    cd ..
fi

# 安装前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 安装前端依赖..."
    cd frontend
    npm install
    cd ..
fi

echo "🔧 编译后端TypeScript..."
cd backend
npm run build
echo "🚀 启动后端服务 (端口3001)..."
npm start &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

echo "🎨 启动前端服务 (端口3000，监听所有网卡)..."
cd frontend
HOST=0.0.0.0 npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 服务启动完成!"
echo "📱 前端界面: http://localhost:3000"
echo "🔗 后端API: http://localhost:3001"
echo ""
# 输出局域网访问地址
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LAN_IP" ]; then
  echo "🌐 局域网访问: http://$LAN_IP:3000"
else
  echo "🌐 局域网访问: 请手动查询本机IP (例如运行 \"ipconfig getifaddr en0\")"
fi
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
trap "echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
