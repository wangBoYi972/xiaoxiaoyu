import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // 移除 crossorigin 属性：Electron file:// 协议下 crossorigin 会导致模块加载失败
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, '');
      },
    },
  ],
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    // 代码分割：减少首屏加载体积
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'highlight.js'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@adapters': path.resolve(__dirname, 'src/adapters'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Web 开发模式：前端在 5173、API 在 Express 服务端，需要代理 /api
    // （桌面端走 IPC 不经过这里，加了无副作用）
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 80}`,
        changeOrigin: true,
      },
    },
  },
});
