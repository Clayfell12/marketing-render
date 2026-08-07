#!/usr/bin/env bash
# Restart the mock and drive the chat view. The restart is not optional: the mock
# imports appHtml, Node caches the module, and a stale server serves the old page
# while you stare at a screenshot wondering why your fix did nothing.
set -e
cd "$(dirname "$0")"

powershell.exe -NoProfile -Command "
  \$c = Get-NetTCPConnection -LocalPort 3457 -State Listen -ErrorAction SilentlyContinue
  if (\$c) { \$c | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force } }
" >/dev/null 2>&1 || true
sleep 0.6

node mock-server.mjs > /tmp/mock.log 2>&1 &
sleep 1.2

mkdir -p shots-app
CHROME_PATH="${CHROME_PATH:-C:/Program Files/Google/Chrome/Application/chrome.exe}" node drive-app.mjs
