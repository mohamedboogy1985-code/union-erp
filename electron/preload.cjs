const { contextBridge, ipcRenderer } = require('electron');

// إصدار التطبيق يصل من العملية الرئيسية عبر additionalArguments (app.getVersion() = package.json)
const versionArg = (process.argv || []).find((arg) => arg.startsWith('--union-erp-version='));
const appVersion = versionArg ? versionArg.slice('--union-erp-version='.length) : 'unknown';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: appVersion,
  isElectron: true,
  printDocument: () => window.print(),
  openFilePath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
});
