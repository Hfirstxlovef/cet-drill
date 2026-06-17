#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f .pid ]; then
  echo "ℹ️  没有发现运行中的进程"
  exit 0
fi

PID=$(cat .pid)
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "🛑 已停止 (PID $PID)"
else
  echo "ℹ️  进程已不存在 (PID $PID)"
fi
rm -f .pid
