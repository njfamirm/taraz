package dev.njfamirm.taraz;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * Declared in the manifest, so Android wakes it even with the app process dead
 * (PRD 4.1). It filters by the approved sender list, queues the raw message, and
 * posts a capture notification. It never parses into a transaction and never
 * writes ledger state — see SmsCapture.
 */
public class SmsCaptureReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;

        // The app is open: its own receiver already forwards this to the WebView.
        if (SmsCapture.isForeground(context)) return;

        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null) return;

        // Long messages arrive as several PDUs and must be stitched per sender.
        Map<String, StringBuilder> bySender = new HashMap<>();
        long receivedAt = System.currentTimeMillis();

        for (SmsMessage part : parts) {
            if (part == null) continue;
            String sender = part.getOriginatingAddress();
            if (sender == null) continue;
            StringBuilder body = bySender.get(sender);
            if (body == null) {
                body = new StringBuilder();
                bySender.put(sender, body);
            }
            body.append(part.getMessageBody());
            receivedAt = part.getTimestampMillis();
        }

        for (Map.Entry<String, StringBuilder> entry : bySender.entrySet()) {
            String sender = entry.getKey();
            // Hard privacy requirement: anything not from an approved bank sender
            // is dropped here and never stored, not even briefly.
            if (!SmsCapture.isKnownSender(context, sender)) continue;

            String body = entry.getValue().toString();
            String captureId = SmsCapture.enqueue(context, sender, body, receivedAt);
            SmsCapture.notify(context, captureId, sender, body);
        }
    }
}
