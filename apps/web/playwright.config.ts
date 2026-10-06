import { defineConfig, devices } from '@playwright/test';

const PORT = 4320;
const baseURL = `http://localhost:${PORT}`;

// L'API sert l'interface compilée (npm run build) : on teste l'application comme en production,
// avec une base PGlite neuve et le paiement simulé.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Porto-Novo',
    trace: 'retain-on-failure',
    // En local, le navigateur Edge déjà installé suffit ; la CI installe Chromium.
    ...(process.env.CI ? {} : { channel: 'msedge' }),
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], ...(process.env.CI ? {} : { channel: 'msedge' }) } }],
  webServer: {
    command: 'npx tsx ../api/src/server.ts',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      PORT: String(PORT),
      APP_URL: baseURL,
      SERVE_WEB: 'true',
      DEMO_MODE: 'true',
      PAYMENT_PROVIDER: 'mock',
      PGLITE_DIR: `.data/e2e-${Date.now()}`,
      JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
    },
  },
});
