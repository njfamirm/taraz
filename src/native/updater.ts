import { registerPlugin, Capacitor } from "@capacitor/core";

const RELEASES = "https://github.com/njfamirm/taraz/releases";

/**
 * Which release feed the updater follows. `stable` resolves to the newest `v*`
 * tag; GitHub's `releases/latest` never points at a pre-release, so `nightly`
 * addresses that rolling pre-release by tag. See docs/RELEASING.md.
 */
export type UpdateChannel = "stable" | "nightly";

const CHANNEL_KEY = "taraz.updateChannel";

/** Published next to the APK by CI; see docs/RELEASING.md. */
function manifestUrl(channel: UpdateChannel): string {
  return channel === "nightly"
    ? `${RELEASES}/download/nightly/update.json`
    : `${RELEASES}/latest/download/update.json`;
}

/**
 * Nightly is the default: it is the only channel CI fills on every push, and
 * `stable` stays empty until the first `v*` tag exists.
 */
export function readChannel(): UpdateChannel {
  try {
    return localStorage.getItem(CHANNEL_KEY) === "stable" ? "stable" : "nightly";
  } catch {
    return "nightly";
  }
}

export function writeChannel(channel: UpdateChannel): void {
  try {
    localStorage.setItem(CHANNEL_KEY, channel);
  } catch {
    // A blocked storage is not worth failing an update check over.
  }
}

export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes?: string;
  releasedAt?: string;
}

export interface InstalledInfo {
  versionCode: number;
  versionName: string;
  packageName: string;
}

export interface AppUpdaterPlugin {
  getInfo(): Promise<InstalledInfo>;
  /** Reads a URL natively — see fetchManifest() for why the WebView cannot. */
  fetchManifest(options: { url: string }): Promise<{ body: string }>;
  /** Whether the app may open the package installer without a settings trip. */
  canInstall(): Promise<{ granted: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<void>;
  addListener(
    event: "downloadProgress",
    handler: (event: { progress: number; bytes: number; total: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

/** The plugin only exists in the Android shell; the browser build has no updater. */
export const updaterAvailable = Capacitor.isNativePlatform();

/**
 * Fetches the release manifest. Throws when offline or when the channel has no
 * release yet.
 *
 * This goes through the native plugin rather than `fetch()`: GitHub serves
 * release assets without an `access-control-allow-origin` header, so a request
 * from the WebView origin is blocked by CORS before it ever reaches the network.
 */
export async function fetchManifest(channel: UpdateChannel): Promise<UpdateManifest> {
  const { body } = await AppUpdater.fetchManifest({ url: manifestUrl(channel) });
  const manifest = JSON.parse(body) as UpdateManifest;
  if (typeof manifest.versionCode !== "number" || !manifest.apkUrl) {
    throw new Error("Malformed update manifest");
  }
  return manifest;
}

/**
 * Starts the download and hands the APK to Android's installer. Resolves
 * `needs-permission` after opening settings when the one-off "install unknown
 * apps" grant is missing; the caller asks the user to retry.
 */
export async function installUpdate(
  manifest: UpdateManifest,
): Promise<"started" | "needs-permission"> {
  const { granted } = await AppUpdater.canInstall();
  if (!granted) {
    await AppUpdater.openInstallSettings();
    return "needs-permission";
  }
  await AppUpdater.downloadAndInstall({ url: manifest.apkUrl });
  return "started";
}

const DISMISSED_KEY = "taraz.updateDismissed";

/** The newest versionCode the user chose "later" for, so a launch does not nag again. */
export function readDismissed(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeDismissed(versionCode: number): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(versionCode));
  } catch {
    // Worst case the prompt shows again next launch.
  }
}
