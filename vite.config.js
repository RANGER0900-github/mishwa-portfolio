import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-simple-maps') || id.includes('d3-')) return 'maps';
          if (id.includes('recharts')) return 'charts';
          if (id.includes('framer-motion') || id.includes('/lenis/') || id.includes('\\lenis\\')) return 'motion';
          if (id.includes('lucide-react') || id.includes('react-icons')) return 'icons';
          if (id.includes('@supabase/supabase-js') || id.includes('redis')) return 'backend-clients';
          return 'vendor';
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
