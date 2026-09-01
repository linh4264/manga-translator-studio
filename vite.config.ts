/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: false,
    cors: true
  },
  plugins: [
    {
      name: 'manga-tools-route-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ? req.url.split('?')[0] : '';
          if (url === '/cong-cu-huu-ich') {
            const query = req.url?.includes('?') ? '?' + req.url.split('?')[1] : '';
            res.writeHead(301, { Location: `/cong-cu-huu-ich/${query}` });
            res.end();
            return;
          }
          next();
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  worker: {
    format: 'es'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        congCuHuuIch: resolve(__dirname, 'cong-cu-huu-ich/index.html')
      }
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
    setupFiles: ['./tests/setup/browser-env.js', './tests/setup/indexeddb-mock.js']
  }
});
