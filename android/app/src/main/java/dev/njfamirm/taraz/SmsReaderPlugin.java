package dev.njfamirm.taraz;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.HashMap;
import java.util.Map;

/**
 * The JS-facing half of SMS capture: inbox reads, live forwarding, and the bridge
 * to what {@link SmsCaptureReceiver} captured while the app was dead.
 *
 * The receiver registered in {@link #load()} only fires with the process alive and
 * feeds the WebView directly. Background capture goes through the manifest
 * receiver, which queues messages in {@link SmsCapture} and posts a notification;
 * the app drains that queue via {@link #consumeCaptured} on startup. Categorizing
 * from the shade is not possible — see PRD 4.3.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(
            alias = SmsReaderPlugin.SMS_ALIAS,
            strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }
        ),
        @Permission(
            alias = SmsReaderPlugin.NOTIFY_ALIAS,
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class SmsReaderPlugin extends Plugin {

    static final String SMS_ALIAS = "sms";
    static final String NOTIFY_ALIAS = "notifications";

    private static final Uri INBOX = Uri.parse("content://sms/inbox");
    private static final int DEFAULT_LIMIT = 500;

    private BroadcastReceiver receiver;
    /** Set when the activity was started by tapping a capture notification. */
    private String pendingCaptureId;

    @Override
    public void load() {
        // A kill while resumed can leave this stale, which would mute background
        // capture; onResume sets it again a moment later.
        SmsCapture.setForeground(getContext(), false);

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
                if (parts == null) return;

                Map<String, StringBuilder> bySender = new HashMap<>();
                long receivedAt = System.currentTimeMillis();

                // Long messages arrive as several PDUs and must be stitched per sender.
                for (SmsMessage part : parts) {
                    if (part == null) continue;
                    String sender = part.getOriginatingAddress();
                    if (sender == null) sender = "";
                    StringBuilder body = bySender.get(sender);
                    if (body == null) {
                        body = new StringBuilder();
                        bySender.put(sender, body);
                    }
                    body.append(part.getMessageBody());
                    receivedAt = part.getTimestampMillis();
                }

                for (Map.Entry<String, StringBuilder> entry : bySender.entrySet()) {
                    // Same hard privacy rule as the manifest receiver (PRD 4.1):
                    // only approved bank senders reach the app.
                    if (!SmsCapture.isKnownSender(context, entry.getKey())) continue;

                    JSObject sms = new JSObject();
                    sms.put("id", "live-" + receivedAt + "-" + entry.getKey());
                    sms.put("sender", entry.getKey());
                    sms.put("body", entry.getValue().toString());
                    sms.put("receivedAt", receivedAt);
                    notifyListeners("smsReceived", sms);
                }
            }
        };

        IntentFilter filter = new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION);
        filter.setPriority(IntentFilter.SYSTEM_HIGH_PRIORITY);
        getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);

        if (getActivity() != null) {
            pendingCaptureId = captureIdOf(getActivity().getIntent());
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        SmsCapture.setForeground(getContext(), true);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        SmsCapture.setForeground(getContext(), false);
    }

    /** The app was already running and a capture notification was tapped. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String captureId = captureIdOf(intent);
        if (captureId == null) return;
        pendingCaptureId = captureId;
        JSObject event = new JSObject();
        event.put("captureId", captureId);
        notifyListeners("captureTapped", event);
    }

    private String captureIdOf(Intent intent) {
        return intent == null ? null : intent.getStringExtra(SmsCapture.EXTRA_CAPTURE_ID);
    }

    @Override
    protected void handleOnDestroy() {
        SmsCapture.setForeground(getContext(), false);
        if (receiver != null) {
            getContext().unregisterReceiver(receiver);
            receiver = null;
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        call.resolve(grantedResult());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState(SMS_ALIAS) == com.getcapacitor.PermissionState.GRANTED) {
            call.resolve(grantedResult());
            return;
        }
        requestPermissionForAlias(SMS_ALIAS, call, "smsPermissionCallback");
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        call.resolve(grantedResult());
    }

    @PluginMethod
    public void listInbox(PluginCall call) {
        if (getPermissionState(SMS_ALIAS) != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }

        int limit = call.getInt("limit", DEFAULT_LIMIT);
        long sinceMs = call.getLong("sinceMs", 0L);

        String selection = sinceMs > 0 ? "date >= ?" : null;
        String[] args = sinceMs > 0 ? new String[] { String.valueOf(sinceMs) } : null;

        JSArray messages = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(
            INBOX,
            new String[] { "_id", "address", "body", "date" },
            selection,
            args,
            "date DESC"
        )) {
            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow("_id");
                int addressCol = cursor.getColumnIndexOrThrow("address");
                int bodyCol = cursor.getColumnIndexOrThrow("body");
                int dateCol = cursor.getColumnIndexOrThrow("date");

                while (cursor.moveToNext() && messages.length() < limit) {
                    JSObject sms = new JSObject();
                    sms.put("id", cursor.getString(idCol));
                    sms.put("sender", cursor.getString(addressCol));
                    sms.put("body", cursor.getString(bodyCol));
                    sms.put("receivedAt", cursor.getLong(dateCol));
                    messages.put(sms);
                }
            }
        } catch (Exception error) {
            call.reject("Failed to read SMS inbox: " + error.getMessage(), error);
            return;
        }

        JSObject result = new JSObject();
        result.put("messages", messages);
        call.resolve(result);
    }

    /**
     * PRD 4.1: the background receiver only captures senders the user approved.
     * Passing an empty list turns background capture off.
     */
    @PluginMethod
    public void setBankSenders(PluginCall call) {
        JSArray senders = call.getArray("senders");
        JSONArray stored = new JSONArray();
        if (senders != null) {
            try {
                for (Object sender : senders.toList()) {
                    if (sender != null) stored.put(String.valueOf(sender));
                }
            } catch (org.json.JSONException error) {
                call.reject("Invalid sender list: " + error.getMessage(), error);
                return;
            }
        }
        SmsCapture.setSenders(getContext(), stored);
        call.resolve();
    }

    /**
     * Hands over everything the manifest receiver queued while the app was dead and
     * clears the queue. `openCaptureId` is set when the app was started by tapping a
     * notification, so the WebView knows which transaction to open.
     */
    @PluginMethod
    public void consumeCaptured(PluginCall call) {
        JSONArray queued = SmsCapture.readQueue(getContext());
        JSArray messages = new JSArray();
        for (int i = 0; i < queued.length(); i++) {
            JSONObject item = queued.optJSONObject(i);
            if (item == null) continue;
            JSObject sms = new JSObject();
            sms.put("id", item.optString("id"));
            sms.put("sender", item.optString("sender"));
            sms.put("body", item.optString("body"));
            sms.put("receivedAt", item.optLong("receivedAt"));
            messages.put(sms);
            SmsCapture.cancel(getContext(), item.optString("id"));
        }
        SmsCapture.clearQueue(getContext());

        JSObject result = new JSObject();
        result.put("messages", messages);
        result.put("openCaptureId", pendingCaptureId);
        pendingCaptureId = null;
        call.resolve(result);
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU
            || getPermissionState(NOTIFY_ALIAS) == com.getcapacitor.PermissionState.GRANTED) {
            checkNotificationPermission(call);
            return;
        }
        requestPermissionForAlias(NOTIFY_ALIAS, call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        checkNotificationPermission(call);
    }

    private JSObject grantedResult() {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(SMS_ALIAS) == com.getcapacitor.PermissionState.GRANTED);
        return result;
    }
}
