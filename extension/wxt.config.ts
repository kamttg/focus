import { defineConfig } from 'wxt';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Fio — AI Focus Companion',
    description: 'Lembretes gentis a partir do contexto de páginas que você autoriza.',
    version: '0.1.2',
    minimum_chrome_version: '120',
    permissions: ['storage', 'tabs', 'scripting', 'idle', 'alarms', 'notifications'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    incognito: 'not_allowed',
    icons: { 128: 'icon.png' }
  }
});
