const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const nodemailer = require('nodemailer');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

let mainWindow;
let motionDetectionProcess = null;
let isArmed = false;
let isArming = false;
let securityPassword = null;
let emailAddress = null;
let armingTimeout = null;

// Email configuration
const emailConfig = {
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

// Verify email configuration on startup
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('Email configuration missing! Please set EMAIL_USER and EMAIL_PASS in .env file');
  dialog.showErrorBox(
    'Email Configuration Error',
    'Please create a .env file with your Gmail credentials:\nEMAIL_USER=your.email@gmail.com\nEMAIL_PASS=your-app-specific-password'
  );
}

const transporter = nodemailer.createTransport(emailConfig);

// Verify email transport
transporter.verify(function(error, success) {
  if (error) {
    console.error('Email transport error:', error);
    dialog.showErrorBox(
      'Email Configuration Error',
      'Failed to connect to email service. Please check your credentials and internet connection.'
    );
  } else {
    console.log('Email server is ready to send messages');
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development mode
  if (process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }
}

// Motion detection using Python script
function startMotionDetection(sensitivity) {
  if (motionDetectionProcess) {
    stopMotionDetection();
  }

  const pythonScript = path.join(__dirname, 'motion_detection.py');
  motionDetectionProcess = spawn('python3', [pythonScript, '--sensitivity', sensitivity]);

  motionDetectionProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message === 'MOTION_DETECTED' && isArmed) {
      console.log('Motion detected, sending alert...');
      mainWindow.webContents.send('motion-detected');
      // Send email alert for motion detection
      sendEmailAlert(
        'Laptop Security Alert - Motion Detected',
        `Motion has been detected in front of your laptop!\n\n` +
        `Time: ${new Date().toLocaleString()}\n` +
        `You have 10 seconds to enter the password to disarm the system.\n\n` +
        `If you did not trigger this alert, please check your laptop immediately.`
      );
    }
  });

  motionDetectionProcess.stderr.on('data', (data) => {
    console.error(`Motion detection error: ${data}`);
  });

  motionDetectionProcess.on('close', (code) => {
    console.log(`Motion detection process exited with code ${code}`);
    motionDetectionProcess = null;
  });
}

function stopMotionDetection() {
  if (motionDetectionProcess) {
    motionDetectionProcess.kill();
    motionDetectionProcess = null;
  }
}

async function sendEmailAlert(subject, message) {
  if (!emailAddress) {
    console.error('No email address configured for alerts');
    return;
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email credentials not configured');
    dialog.showErrorBox(
      'Email Configuration Error',
      'Email alerts are not configured. Please set up your email credentials in the .env file.'
    );
    return;
  }

  try {
    console.log('Sending email to:', emailAddress);
    const info = await transporter.sendMail({
      from: `"Laptop Security" <${emailConfig.auth.user}>`,
      to: emailAddress,
      subject: subject,
      text: message
    });
    console.log('Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Failed to send email alert:', error);
    dialog.showErrorBox(
      'Email Error',
      `Failed to send email alert: ${error.message}`
    );
  }
}

function playAlarmSound() {
  const soundPath = path.join(__dirname, 'alarm.mp3');
  if (fs.existsSync(soundPath)) {
    const { exec } = require('child_process');
    if (process.platform === 'darwin') {
      exec(`afplay "${soundPath}"`);
    } else if (process.platform === 'win32') {
      exec(`start "" "${soundPath}"`);
    } else {
      exec(`aplay "${soundPath}"`);
    }
  }
}

async function triggerAlarm(reason) {
  if (!isArmed) return;

  isArmed = false;
  mainWindow.webContents.send('alarm-triggered');
  playAlarmSound();
  
  // Send detailed email alert
  await sendEmailAlert(
    'Laptop Security Alert - ALARM TRIGGERED',
    `SECURITY ALARM TRIGGERED!\n\n` +
    `Reason: ${reason}\n` +
    `Time: ${new Date().toLocaleString()}\n\n` +
    `The system was not disarmed in time. Please check your laptop immediately.\n` +
    `If this was a false alarm, you may need to adjust the motion sensitivity.`
  );
  
  // Show system notification
  const notification = {
    title: 'Laptop Security Alert',
    body: reason || 'Security system triggered!',
    icon: path.join(__dirname, 'icon.png')
  };
  
  if (process.platform === 'darwin') {
    const { Notification } = require('electron');
    new Notification(notification).show();
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: notification.title,
      message: notification.body,
      buttons: ['OK']
    });
  }

  // Stop motion detection
  stopMotionDetection();
}

// Hash password for secure storage
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for security system
ipcMain.handle('arm-system', async (event, settings) => {
  try {
    if (isArmed || isArming) {
      throw new Error('System is already armed or arming');
    }

    console.log('Starting arming sequence with settings:', {
      email: settings.email,
      sensitivity: settings.sensitivity,
      hasPassword: !!settings.password
    });

    // Store security settings
    securityPassword = hashPassword(settings.password);
    emailAddress = settings.email;
    isArming = true;

    // Send initial arming email
    await sendEmailAlert(
      'Laptop Security System Arming',
      'Your laptop security system is starting to arm. You have 5 seconds to leave the area.'
    );

    // Start the arming countdown
    let timeLeft = 5;
    const countdownInterval = setInterval(() => {
      if (timeLeft > 0) {
        mainWindow.webContents.send('arming-countdown', timeLeft);
        timeLeft--;
      } else {
        clearInterval(countdownInterval);
        // Start motion detection after countdown
        startMotionDetection(settings.sensitivity);
        isArmed = true;
        isArming = false;
        mainWindow.webContents.send('arming-complete');
        
        // Send armed confirmation email
        sendEmailAlert(
          'Laptop Security System Armed',
          'Your laptop security system is now fully armed and monitoring for motion.'
        );
      }
    }, 1000);

    return true;
  } catch (error) {
    console.error('Error arming system:', error);
    isArming = false;
    throw error;
  }
});

ipcMain.handle('disarm-system', async () => {
  try {
    if (!isArmed && !isArming) {
      throw new Error('System is not armed');
    }

    // Clear any arming timeout if it exists
    if (armingTimeout) {
      clearTimeout(armingTimeout);
      armingTimeout = null;
    }

    isArmed = false;
    isArming = false;
    securityPassword = null;
    stopMotionDetection();

    // Send confirmation email
    await sendEmailAlert(
      'Laptop Security System Disarmed',
      'Your laptop security system has been disarmed successfully.'
    );

    return true;
  } catch (error) {
    console.error('Error disarming system:', error);
    throw error;
  }
});

ipcMain.handle('verify-disarm-password', async (event, password) => {
  try {
    if (!isArmed || !securityPassword) {
      throw new Error('System is not armed');
    }

    const hashedInput = hashPassword(password);
    return hashedInput === securityPassword;
  } catch (error) {
    console.error('Error verifying password:', error);
    throw error;
  }
});

// Add this with the other IPC handlers
ipcMain.handle('triggerAlarm', async (event, reason) => {
  try {
    await triggerAlarm(reason);
    return true;
  } catch (error) {
    console.error('Error triggering alarm:', error);
    throw error;
  }
}); 