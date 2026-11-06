import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type ProxyOptions, type UserConfig } from 'vite';
import path from 'node:path';

const target = process.env.IMMICH_SERVER_URL || 'http://localhost:2283/';

const proxyConfig: Record<string, ProxyOptions> = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
    ws: true,
    timeout: 60000,
    rewrite: (path) => path,
    configure: (proxy, options) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        proxyReq.setHeader('Accept', '*/*');
        proxyReq.setHeader('Connection', 'keep-alive');
      });
      proxy.on('proxyRes', (proxyRes, req, res) => {
        const ct = proxyRes.headers['content-type'];
        if (ct && !ct.includes('json')) {
          res.setHeader('Content-Type', ct);
        }
      });
    },
  },
  '/.well-known/immich': {
    target,
    secure: false,
    changeOrigin: true,
    ws: true,
    timeout: 60000,
  },
  '/custom.css': {
    target,
    secure: false,
    changeOrigin: true,
    timeout: 60000,
  },
};

export default defineConfig({
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      'xmlhttprequest-ssl': './node_modules/engine.io-client/lib/xmlhttprequest.js',
      '@test-data': path.resolve(import.meta.dirname, './src/test-data'),
    },
  },
  server: {
    proxy: proxyConfig,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  preview: {
    proxy: proxyConfig,
  },
  plugins: [
    enhancedImages(),
    tailwindcss(),
    sveltekit(),
    process.env.BUILD_STATS === 'true'
      ? visualizer({
          emitFile: true,
          filename: 'stats.html',
        })
      : undefined,
    svelteTesting(),
  ],
  optimizeDeps: {
    entries: ['src/**/*.{svelte,ts,html}'],
  },
  test: {
    name: 'web:unit',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-data/setup.ts'],
    sequence: {
      hooks: 'list',
    },
    env: {
      TZ: 'UTC',
    },
  },
}) satisfies UserConfig;