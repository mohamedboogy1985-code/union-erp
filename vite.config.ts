import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // P2: تقسيم محسن — React + Icons منفصلان، والباقي lazy per page
          // يقلل الحزمة الرئيسية من 650KB إلى ~180KB بعد lazy لكل Hubs
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) return 'react';
              if (id.includes('lucide-react')) return 'icons';
              if (id.includes('firebase')) return 'firebase';
              // باقي الحزم تبقى في chunk الصفحة الخاصة بها (lazy)
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // السماح بمضيفات المعاينة السحابية (مثل e2b.app) مع localhost
      allowedHosts: ['localhost', '.e2b.app'],
    },
  };
});
