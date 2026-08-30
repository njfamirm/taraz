package dev.njfamirm.taraz;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates for a sideloaded build: report the installed version, download
 * a release APK, and hand it to the system package installer.
 *
 * There is no silent install — Android always shows its own confirm dialog, and
 * the user has to grant "install unknown apps" to this app once.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String DOWNLOAD_DIR = "updates";
    private static final String APK_NAME = "taraz-update.apk";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;

    /** The installed versionCode/versionName, so the web layer can compare. */
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            android.content.pm.PackageInfo info = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            result.put("versionCode", info.getLongVersionCode());
            result.put("versionName", info.versionName);
            result.put("packageName", info.packageName);
        } catch (Exception error) {
            call.reject("Failed to read package info: " + error.getMessage(), error);
            return;
        }
        call.resolve(result);
    }

    /** Whether this app may launch the package installer without a settings trip. */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    /** Opens the per-app "install unknown apps" toggle. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * Fetches the release manifest natively. The WebView cannot do this itself:
     * GitHub serves release assets with no `access-control-allow-origin` header,
     * so a `fetch()` from the app origin is blocked by CORS.
     */
    @PluginMethod
    public void fetchManifest(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A manifest url is required");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = open(url);
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) {
                    byte[] chunk = new byte[8 * 1024];
                    int read;
                    while ((read = input.read(chunk)) != -1) {
                        buffer.write(chunk, 0, read);
                        if (buffer.size() > MAX_MANIFEST_BYTES) {
                            throw new IllegalStateException("Manifest is implausibly large");
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("body", buffer.toString("UTF-8"));
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    /**
     * Downloads {@code url} into the cache and opens the installer. Progress is
     * emitted as `downloadProgress` events with a 0..1 `progress` field.
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A download url is required");
            return;
        }

        new Thread(() -> {
            try {
                File apk = download(url);
                install(apk);
                call.resolve();
            } catch (Exception error) {
                call.reject("Update failed: " + error.getMessage(), error);
            }
        }).start();
    }

    /**
     * Opens {@code url}, following redirects by hand: HttpURLConnection refuses
     * to follow one that changes protocol, and GitHub bounces both the manifest
     * and the APK to a separate CDN host.
     */
    private HttpURLConnection open(String url) throws Exception {
        HttpURLConnection connection = null;
        String next = url;
        for (int hop = 0; ; hop++) {
            if (connection != null) connection.disconnect();
            connection = (HttpURLConnection) new URL(next).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.connect();

            int status = connection.getResponseCode();
            boolean redirected = status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
            if (!redirected) {
                if (status != HttpURLConnection.HTTP_OK) {
                    connection.disconnect();
                    throw new IllegalStateException("HTTP " + status);
                }
                return connection;
            }
            if (hop >= MAX_REDIRECTS) throw new IllegalStateException("Too many redirects");
            next = connection.getHeaderField("Location");
            if (next == null) throw new IllegalStateException("Redirect without a location");
        }
    }

    private File download(String url) throws Exception {
        File dir = new File(getContext().getCacheDir(), DOWNLOAD_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Cannot create the download directory");
        }
        File apk = new File(dir, APK_NAME);
        if (apk.exists() && !apk.delete()) {
            throw new IllegalStateException("Cannot replace the previous download");
        }

        HttpURLConnection connection = open(url);
        long total = connection.getContentLengthLong();
        long written = 0;
        int lastPercent = -1;

        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(apk)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                written += read;
                if (total > 0) {
                    int percent = (int) (written * 100 / total);
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        JSObject event = new JSObject();
                        event.put("progress", percent / 100.0);
                        event.put("bytes", written);
                        event.put("total", total);
                        notifyListeners("downloadProgress", event);
                    }
                }
            }
        } finally {
            connection.disconnect();
        }

        if (written == 0) throw new IllegalStateException("Downloaded an empty file");
        return apk;
    }

    private void install(File apk) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
