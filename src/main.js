const { app, BrowserWindow, Menu, Tray, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let tray;
let quitting = false;
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
  app.setAppUserModelId('com.ziyu.apple.desktop.pet');
  settings = loadSettings();
  applyAutoStartSetting();
  createWindow();
  createTray();
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

app.on('window-all-closed', event => event.preventDefault());
