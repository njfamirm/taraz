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
 * Reads the SMS inbox and forwards incoming messages to the WebView.
 *
 * Deliberately minimal: the receiver registered here lives with the plugin, so it
 * only fires while the app process is alive. The always-on manifest receiver that
 * posts actionable notifications with the WebView dead is a later step.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(
            alias = SmsReaderPlugin.SMS_ALIAS,
            strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }
        )
    }
)
public class SmsReaderPlugin extends Plugin {

    static final String SMS_ALIAS = "sms";

    private static final Uri INBOX = Uri.parse("content://sms/inbox");
    private static final int DEFAULT_LIMIT = 500;

    private BroadcastReceiver receiver;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Map<String, StringBuilder> bySender = new HashMap<>();
                long receivedAt = System.currentTimeMillis();

                // Long messages arrive as several PDUs and must be stitched per sender.
                for (SmsMessage part : Telephony.Sms.Intents.getMessagesFromIntent(intent)) {
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
    }

    @Override
    protected void handleOnDestroy() {
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

    private JSObject grantedResult() {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(SMS_ALIAS) == com.getcapacitor.PermissionState.GRANTED);
        return result;
    }
}
