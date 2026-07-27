const { app, BrowserWindow, Menu, Tray, ipcMain, screen, Notification } = require('electron');
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

const WINDOW_WIDTH = 90;
const WINDOW_HEIGHT = 86;

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
  win.setBounds({
    x: next.x,
    y: next.y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT
  }, false);
}

function readWeComUnread(callback) {
  const command = `
    $best = 0;
    $processes = Get-Process WXWork -ErrorAction SilentlyContinue;
    foreach ($process in $processes) {
      $title = $process.MainWindowTitle;
      if ($title) {
        $matches = [regex]::Matches($title, '(?:[\\(（\\[【]\\s*|^)(\\d{1,4})(?:\\s*[\\)）\\]】]|\\s*(?:条)?(?:未读|新消息))');
        foreach ($match in $matches) {
          $value = [int]$match.Groups[1].Value;
          if ($value -gt $best) { $best = $value }
        }
      }
      if ($process.MainWindowHandle -ne 0) {
        try {
          Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -ErrorAction SilentlyContinue;
          $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle);
          $items = $root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
          );
          foreach ($item in $items) {
            $name = $item.Current.Name;
            if (-not $name -or $name.Length -gt 30) { continue }
            $patterns = @(
              '(\\d{1,4})\\s*条?\\s*(?:未读|新消息)',
              '(?:未读|新消息)\\s*[：:]?\\s*(\\d{1,4})'
            );
            foreach ($pattern in $patterns) {
              $match = [regex]::Match($name, $pattern);
              if ($match.Success) {
                $value = [int]$match.Groups[1].Value;
                if ($value -gt $best) { $best = $value }
              }
            }
          }
        } catch {}
      }
    }
    Write-Output $best
  `;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      const unread = Number.parseInt(String(stdout || '').trim(), 10) || 0;
      callback(error, unread);
    });
}

function queryWeComUnread() {
  if (!weComReminderEnabled || !win || win.isDestroyed()) return;
  readWeComUnread((_error, unread) => {
      if (!win || win.isDestroyed()) return;
      if (unread > lastUnreadCount) {
        showWeComNotification();
      }
      lastUnreadCount = unread;
  });
}

function showWeComNotification() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('wecom-notification');
  if (tray && process.platform === 'win32') {
    tray.displayBalloon({
      iconType: 'info',
      title: '苹果提醒',
      content: '企业微信有新消息',
      respectQuietTime: false
    });
  } else if (Notification.isSupported()) {
    const notification = new Notification({
      title: '苹果提醒',
      body: '企业微信有新消息',
      silent: true
    });
    notification.on('click', focusWeCom);
    notification.show();
  }
}

function showStatusNotification(title, body) {
  if (tray && process.platform === 'win32') {
    tray.displayBalloon({ iconType: 'info', title, content: body, respectQuietTime: false });
  } else if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
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
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    movable: false,
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
  win.setMinimumSize(WINDOW_WIDTH, WINDOW_HEIGHT);
  win.setMaximumSize(WINDOW_WIDTH, WINDOW_HEIGHT);
  win.on('resize', () => {
    const [x, y] = win.getPosition();
    win.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, false);
  });
  win.on('maximize', () => {
    win.unmaximize();
    const [x, y] = win.getPosition();
    moveWindowSafely(x, y, { x, y });
  });
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
    { label: '叫苹果出来', click: () => win.showInactive() },
    { label: '让苹果挥手', click: () => win.webContents.send('pet-action', 'wave') },
    { label: '让苹果挠头', click: () => win.webContents.send('pet-action', 'scratch') },
    { label: '企微消息提醒', type: 'checkbox', checked: true, click: item => { weComReminderEnabled = item.checked; } },
    { label: '测试企微提醒', click: () => showWeComNotification() },
    { label: '检测企微状态', click: () => {
      readWeComUnread((error, unread) => {
        showStatusNotification(
          '企微检测结果',
          error ? '无法读取企业微信状态' : `识别到 ${unread} 条未读消息`
        );
      });
    } },
    { label: '打开企业微信', click: () => focusWeCom() },
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
  tray.on('balloon-click', () => focusWeCom());
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.ziyu.apple.desktop.pet');
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
  win.showInactive();
});

ipcMain.on('begin-drag', (_event, point) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const cursor = screen.getCursorScreenPoint();
  dragState = { cursorX: cursor.x, cursorY: cursor.y, windowX: x, windowY: y };
});

ipcMain.on('drag-pet', () => {
  if (!dragState || !win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const x = dragState.windowX + cursor.x - dragState.cursorX;
  const y = dragState.windowY + cursor.y - dragState.cursorY;
  moveWindowSafely(x, y, cursor);
});

ipcMain.on('end-drag', () => { dragState = null; });
ipcMain.on('set-click-through', (_event, ignore) => {
  if (!win || win.isDestroyed() || dragState) return;
  win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on('open-wecom', () => focusWeCom());

app.on('before-quit', () => {
  clearInterval(weComMonitor);
});
app.on('window-all-closed', event => event.preventDefault());
