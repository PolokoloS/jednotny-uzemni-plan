// Smoke testy proti živým službám. Před spuštěním: python build.py
const { defineConfig } = require('@playwright/test');

const py = process.platform === 'win32' ? 'python' : 'python3';

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 120000,
  retries: 1,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    viewport: { width: 1280, height: 800 },
    locale: 'cs-CZ'
  },
  webServer: {
    command: `${py} -m http.server 8080 -d dist`,
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: true,
    timeout: 30000
  }
});
