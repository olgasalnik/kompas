/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base: './' — сборка открывается и с GitHub Pages, и из любой папки.
// Режим offline (npm run build:offline) собирает ВСЁ в один HTML-файл: запасной вариант для защиты без интернета.
// Модели распознавания текста (public/ocr, ~13 МБ) в один файл не входят — см. src/ui/ocr.ts.
// В одном файле нет соседних файлов: значок (копия public/favicon.svg) встраивается прямо в страницу, манифест PWA не нужен
const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#4b3a8c"/><circle cx="32" cy="32" r="19" fill="none" stroke="#e9e4ff" stroke-width="2.5" opacity=".55"/><path d="M32 9 L37 32 L32 55 L27 32 Z" fill="#e9e4ff"/><path d="M9 32 L32 27 L55 32 L32 37 Z" fill="#9fe3c9"/><circle cx="32" cy="32" r="4" fill="#4b3a8c" stroke="#e9e4ff" stroke-width="2"/></svg>';
const standaloneHead: Plugin = {
  name: 'kompas-standalone-head',
  transformIndexHtml(html) {
    const svg = FAVICON;
    return html
      .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`)
      .replace(/\s*<link rel="manifest"[^>]*>/, '');
  },
};

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'offline' ? [standaloneHead, viteSingleFile()] : [])],
  build: mode === 'offline' ? { outDir: 'offline', emptyOutDir: true, copyPublicDir: false } : { outDir: 'dist' },
  server: { port: 5180, host: true },
  preview: { port: 5181, host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
