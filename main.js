const { app, BrowserWindow, Menu, Tray, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let win;
let tray;
let quitting = false;
let weComMonitor;
let lastUnreadCount = 0;
let weComReminderEnabled = true;
let dragState = null;
let settings = { autoStartEnabled: true };

const WINDOW_WIDTH = 160;
const WINDOW_HEIGHT = 140;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function clampPosition(x, y, display) {
  const area = display.workArea;
  const [width, height] = win && !win.isDestroyed()
    ? win.getSize()
    : [WINDOW_WIDTH, WINDOW_HEIGHT];
  return {
    x: Math.max(area.x, Math.min(area.x + area.width - width, Math.round(x))),
    y: Math.max(area.y, Math.min(area.y + area.height - height, Math.round(y)))
  };
}

function moveWindowSafely(x, y, displayPoint) {
  if (!win || win.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(displayPoint || { x, y });
  const next = clampPosition(x, y, display);
  win.setPosition(next.x, next.y);
}

function queryWeComUnread() {
  if (!weComReminderEnabled || !win || win.isDestroyed()) return;
  const command = `
    $titles = Get-Process WXWork -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle } |
      ForEach-Object { $_.MainWindowTitle };
    $best = 0;
    foreach ($title in $titles) {
      $matches = [regex]::Matches($title, '(?:[\\(（\\[【]\\s*|^)(\\d{1,4})(?:\\s*[\\)）\\]】]|\\s*(?:条)?未读)');
      foreach ($match in $matches) {
        $value = [int]$match.Groups[1].Value;
        if ($value -gt $best) { $best = $value }
      }
    }
    Write-Output $best
  `;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 2500 }, (_error, stdout) => {
      const unread = Number.parseInt(String(stdout || '').trim(), 10) || 0;
      if (unread > lastUnreadCount) {
        win.showInactive();
        win.webContents.send('wecom-notification');
      }
      lastUnreadCount = unread;
    });
}

function focusWeCom() {
  const script = `
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@;
    $p = Get-Process WXWork -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1;
    if ($p) { [Win32Focus]::ShowWindowAsync($p.MainWindowHandle, 9); [Win32Focus]::SetForegroundWindow($p.MainWindowHandle) }
  `;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: area.x + area.width - WINDOW_WIDTH - 18,
    y: area.y + area.height - WINDOW_HEIGHT - 18,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return { ...settings, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return { ...settings };
  }
}

function saveSettings() {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function applyAutoStartSetting() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: settings.autoStartEnabled,
    path: process.execPath
  });
}

function createTray() {
  // Electron's icon is a safe fallback; the pet remains controllable by right-click.
  tray = new Tray(path.join(__dirname, '..', 'assets', 'tray.png'));
  const menu = Menu.buildFromTemplate([
    { label: '叫苹果出来', click: () => win.show() },
    { label: '让苹果挥手', click: () => win.webContents.send('pet-action', 'wave') },
    { label: '让苹果挠头', click: () => win.webContents.send('pet-action', 'scratch') },
    { label: '企微消息提醒', type: 'checkbox', checked: true, click: item => { weComReminderEnabled = item.checked; } },
    { label: '测试企微提醒', click: () => {
      win.showInactive();
      win.webContents.send('wecom-notification');
    } },
    { label: '开机自动启动', type: 'checkbox', checked: settings.autoStartEnabled,
      click: item => {
        settings.autoStartEnabled = item.checked;
        saveSettings();
        applyAutoStartSetting();
      } },
    { type: 'separator' },
    { label: '始终置顶', type: 'checkbox', checked: true, click: item => win.setAlwaysOnTop(item.checked) },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setToolTip('苹果桌宠');
  tray.setContextMenu(menu);
  tray.on('double-click', () => win.show());
}

app.whenReady().then(() => {
  settings = loadSettings();
  applyAutoStartSetting();
  createWindow();
  createTray();
  weComMonitor = setInterval(queryWeComUnread, 3000);
  queryWeComUnread();
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

ipcMain.on('begin-drag', (_event, point) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  dragState = { cursorX: point.x, cursorY: point.y, windowX: x, windowY: y };
});

ipcMain.on('drag-pet', (_event, point) => {
  if (!dragState || !win || win.isDestroyed()) return;
  const x = dragState.windowX + point.x - dragState.cursorX;
  const y = dragState.windowY + point.y - dragState.cursorY;
  moveWindowSafely(x, y, point);
});

ipcMain.on('end-drag', () => { dragState = null; });

ipcMain.on('open-wecom', () => focusWeCom());

app.on('before-quit', () => {
  clearInterval(weComMonitor);
});
app.on('window-all-closed', event => event.preventDefault());
