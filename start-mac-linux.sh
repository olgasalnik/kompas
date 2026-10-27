#!/bin/sh
# Компас: запуск на macOS и Linux. В терминале: sh start-mac-linux.sh
# Первый запуск ставит зависимости (1–3 минуты), затем открывает http://localhost:5180 в браузере.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите версию LTS с https://nodejs.org и запустите снова."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Устанавливаю зависимости — только при первом запуске, 1–3 минуты…"
  npm install || exit 1
fi
echo "Компас запускается: http://localhost:5180 (остановить — Ctrl+C)"
npm run dev -- --open
