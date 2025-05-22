const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'alarmAPI', {
    setAlarm: (time) => ipcRenderer.invoke('set-alarm', time),
    cancelAlarm: () => ipcRenderer.invoke('cancel-alarm'),
    onAlarmTrigger: (callback) => {
      ipcRenderer.on('alarm-triggered', callback);
      return () => {
        ipcRenderer.removeListener('alarm-triggered', callback);
      };
    }
  }
); 