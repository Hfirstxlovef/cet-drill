#!/bin/bash
cd "$(dirname "$0")"

# 检查是否已在运行
if [ -f .pid ] && kill -0 "$(cat .pid)" 2>/dev/null; then
  echo "✅ 已在运行 (PID $(cat .pid))，端口 13820"
  exit 0
fi

echo "🚀 启动 CET 试题对练系统 ..."
nohup npm run start > .server.log 2>&1 &
echo $! > .pid
sleep 1

if kill -0 "$(cat .pid)" 2>/dev/null; then
  echo "✅ 启动成功 (PID $(cat .pid))"
  echo "   http://localhost:13820"
else
  echo "❌ 启动失败，查看日志: .server.log"
  rm -f .pid
  exit 1
fi
