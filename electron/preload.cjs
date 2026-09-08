'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Deliberately tiny renderer API. The web app does not receive Node.js or
 * Electron access; it only gets the one native action it needs for external
 * links and a platform marker for desktop-specific UI decisions.
 */
contextBridge.exposeInMainWorld('glassgem', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
  openExternal: (url) => ipcRenderer.invoke('glassgem:open-external', url),
}))
