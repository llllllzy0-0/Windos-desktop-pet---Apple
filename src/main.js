const { app, BrowserWindow, Menu, Tray, ipcMain, screen } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

let win;
let tray;
let quitting = false;
let weComMonitor;
let lastUnreadCount = 0;
let weComReminderEnabled = true;

function queryWeComUnread() {
  if (!weComReminderEnabled || !win || win.isDestroyed()) return;
  const command = "(Get-Process WXWork -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle} | Select-Object -First 1 -ExpandProperty MainWindowTitle)";
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 2500 }, (_error, stdout) => {
      const title = String(stdout || '').trim();
      // Common WeCom title formats include 企业微信 (3), 企业微信（3） or [3] 企业微信.
      const match = title.match(/[\(（\[【]\s*(\d+)\s*[\)）\]】]/);
      const unread = match ? Number(match[1]) : 0;
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
    width: 240,
    height: 220,
    x: area.x + area.width - 270,
    y: area.y + area.height - 250,
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

function createTray() {
  // Electron's icon is a safe fallback; the pet remains controllable by right-click.
  tray = new Tray(path.join(__dirname, '..', 'assets', 'tray.png'));
  const menu = Menu.buildFromTemplate([
    { label: '叫苹果出来', click: () => win.show() },
    { label: '让苹果挥手', click: () => win.webContents.send('pet-action', 'wave') },
    { label: '让苹果挠头', click: () => win.webContents.send('pet-action', 'scratch') },
    { label: '企微消息提醒', type: 'checkbox', checked: true, click: item => { weComReminderEnabled = item.checked; } },
    { type: 'separator' },
    { label: '始终置顶', type: 'checkbox', checked: true, click: item => win.setAlwaysOnTop(item.checked) },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setToolTip('苹果桌宠');
  tray.setContextMenu(menu);
  tray.on('double-click', () => win.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  weComMonitor = setInterval(queryWeComUnread, 3000);
  queryWeComUnread();
});

ipcMain.on('move-pet', (_event, { dx, dy }) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  const area = screen.getDisplayNearestPoint({ x, y }).workArea;
  win.setPosition(
    Math.max(area.x, Math.min(area.x + area.width - 240, x + Math.round(dx))),
    Math.max(area.y, Math.min(area.y + area.height - 220, y + Math.round(dy)))
  );
});

ipcMain.on('open-wecom', () => focusWeCom());

app.on('before-quit', () => clearInterval(weComMonitor));
app.on('window-all-closed', event => event.preventDefault());
