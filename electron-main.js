const http = require("http");
const path = require("path");

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");

const PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://127.0.0.1:${PORT}`;
const iconPath = path.join(__dirname, "build-resources", "icon.png");

let mainWindow = null;
let serverStartPromise = null;

function waitForServer(url, attempts = 120, delayMs = 500) {
  return new Promise((resolve, reject) => {
    const tryConnect = (remaining) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (remaining <= 1) {
          reject(new Error(`Unable to connect to ${url}.`));
          return;
        }
        setTimeout(() => tryConnect(remaining - 1), delayMs);
      });

      request.setTimeout(3000, () => {
        request.destroy(new Error("Request timed out."));
      });
    };

    tryConnect(attempts);
  });
}

async function ensureDesktopServer() {
  if (!serverStartPromise) {
    const { startServer } = require(path.join(__dirname, "server.js"));
    serverStartPromise = startServer(PORT)
      .then(() => ({ mode: "started" }))
      .catch((error) => {
        if (error?.code === "EADDRINUSE") {
          return { mode: "existing" };
        }
        throw error;
      });
  }

  return serverStartPromise;
}

function createMainWindow() {
  if (mainWindow) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(APP_URL);
  return mainWindow;
}

async function bootstrapDesktopApp() {
  const serverState = await ensureDesktopServer();
  if (serverState?.mode === "existing") {
    try {
      await waitForServer(APP_URL);
    } catch (_error) {
      throw new Error(
        `Port ${PORT} is already in use, but no LabCenter In server responded on ${APP_URL}. ` +
        "Stop the other process on that port or launch LabCenter In after freeing it."
      );
    }
  }
  createMainWindow();
}

app.whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null);
    await bootstrapDesktopApp();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await bootstrapDesktopApp();
      }
    });
  })
  .catch((error) => {
    dialog.showErrorBox(
      "LabCenter In Desktop Launch Failed",
      error?.message || "Unexpected error while starting the desktop application."
    );
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
