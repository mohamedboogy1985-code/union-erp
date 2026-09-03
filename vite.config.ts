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
      // الحزمة الرئيسية تحوي كل وحدات العمل المحاسبية/العضوية/الموارد (تُعرض فوراً
      // على الشاشة الأولى بلا تنقّل)، لذا نرفع عتبة التنبيه فوق حجمها المقبول.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // تقسيم المكتبات الأساسية إلى حزم منفصلة لتسريع الإقلاع والاستفادة من التخزين المؤقت
          manualChunks: {
            react: ['react', 'react-dom'],
            icons: ['lucide-react'],
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
