const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'alarmAPI', {
    // System control
    armSystem: (settings) => ipcRenderer.invoke('arm-system', settings),
    disarmSystem: () => ipcRenderer.invoke('disarm-system'),
    verifyDisarmPassword: (password) => ipcRenderer.invoke('verify-disarm-password', password),
    
    // Event listeners
    onMotionDetected: (callback) => {
      ipcRenderer.on('motion-detected', () => callback());
    },
    onAlarmTrigger: (callback) => {
      ipcRenderer.on('alarm-triggered', () => callback());
    },
    onArmingCountdown: (callback) => {
      ipcRenderer.on('arming-countdown', (_, timeLeft) => callback(timeLeft));
    },
    onArmingComplete: (callback) => {
      ipcRenderer.on('arming-complete', () => callback());
    }
  }
); 