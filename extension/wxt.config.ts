import { defineConfig } from 'wxt';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Fio — AI Focus Companion',
    description: 'Analisa páginas durante suas sessões e lembra gentilmente do seu objetivo.',
    version: '0.2.0',
    minimum_chrome_version: '120',
    permissions: ['storage', 'tabs', 'scripting', 'idle', 'alarms', 'notifications'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    incognito: 'not_allowed',
    icons: { 128: 'icon.png' }
  }
});
