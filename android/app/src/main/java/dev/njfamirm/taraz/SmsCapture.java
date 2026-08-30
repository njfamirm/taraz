package dev.njfamirm.taraz;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The background half of SMS capture (PRD 4.1 / 4.3).
 *
 * The receiver runs with the WebView dead, so it cannot touch the ledger — that
 * lives in IndexedDB inside the app. Instead it queues the raw message here and
 * posts a notification. When the user taps it, the app starts, drains the queue,
 * ingests the messages, and opens the one that was tapped. Nothing is categorized
 * from the shade; native code never writes ledger state.
 */
final class SmsCapture {

    static final String PREFS = "taraz.capture";
    static final String EXTRA_CAPTURE_ID = "taraz.captureId";

    private static final String KEY_SENDERS = "senders";
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_SEQ = "seq";
    private static final String KEY_FOREGROUND = "foreground";
    private static final String CHANNEL_ID = "taraz.capture";

    /** Beyond this the phone is queueing faster than the user opens the app. */
    private static final int MAX_QUEUED = 100;

    private SmsCapture() {}

    /**
     * While the app is in the foreground the plugin's own receiver feeds the WebView
     * live, so the background path stays quiet instead of double-notifying.
     */
    static void setForeground(Context context, boolean foreground) {
        prefs(context).edit().putBoolean(KEY_FOREGROUND, foreground).apply();
    }

    static boolean isForeground(Context context) {
        return prefs(context).getBoolean(KEY_FOREGROUND, false);
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * PRD 4.1: only senders the user approved are read or stored. An empty list
     * means nothing is captured in the background — approving a sender in the app
     * is what turns capture on.
     */
    static boolean isKnownSender(Context context, String sender) {
        if (sender == null || sender.isEmpty()) return false;
        String stored = prefs(context).getString(KEY_SENDERS, "[]");
        try {
            JSONArray senders = new JSONArray(stored);
            for (int i = 0; i < senders.length(); i++) {
                if (sameSender(senders.optString(i), sender)) return true;
            }
        } catch (JSONException ignored) {}
        return false;
    }

    /** Operators prefix short codes inconsistently (+98, 0, 9810…), so compare tails. */
    private static boolean sameSender(String a, String b) {
        if (a == null || b == null) return false;
        if (a.equalsIgnoreCase(b)) return true;
        String da = a.replaceAll("\\D", "");
        String db = b.replaceAll("\\D", "");
        if (da.isEmpty() || db.isEmpty()) return false;
        return da.endsWith(db) || db.endsWith(da);
    }

    static void setSenders(Context context, JSONArray senders) {
        prefs(context).edit().putString(KEY_SENDERS, senders.toString()).apply();
    }

    /** Queues one message and returns its capture id. */
    static String enqueue(Context context, String sender, String body, long receivedAt) {
        SharedPreferences prefs = prefs(context);
        int seq = prefs.getInt(KEY_SEQ, 0) + 1;
        String captureId = "capture-" + receivedAt + "-" + seq;

        JSONArray queue = readQueue(context);
        JSONObject message = new JSONObject();
        try {
            message.put("id", captureId);
            message.put("sender", sender);
            message.put("body", body);
            message.put("receivedAt", receivedAt);
        } catch (JSONException error) {
            return captureId;
        }
        queue.put(message);

        // Drop the oldest rather than growing without bound.
        while (queue.length() > MAX_QUEUED) queue.remove(0);

        prefs.edit().putString(KEY_QUEUE, queue.toString()).putInt(KEY_SEQ, seq).apply();
        return captureId;
    }

    static JSONArray readQueue(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_QUEUE, "[]"));
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    static void clearQueue(Context context) {
        prefs(context).edit().putString(KEY_QUEUE, "[]").apply();
    }

    static void notify(Context context, String captureId, String sender, String body) {
        createChannel(context);

        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra(EXTRA_CAPTURE_ID, captureId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int requestCode = captureId.hashCode();
        PendingIntent pending = PendingIntent.getActivity(
            context,
            requestCode,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(headline(body, sender))
            .setContentText("برای ثبت ضربه بزنید")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSubText(sender)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(requestCode, notification);
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted; the message is queued either way.
        }
    }

    static void cancel(Context context, String captureId) {
        NotificationManagerCompat.from(context).cancel(captureId.hashCode());
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "تراکنش‌های تازه",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("اعلان پیامک بانکی تازه، برای ثبت سریع تراکنش");
        manager.createNotificationChannel(channel);
    }

    /** Kept deliberately close to the JS parser's generic patterns (src/lib/banks.ts). */
    private static final Pattern AMOUNT_WITH_UNIT = Pattern.compile(
        "([\\d,\\u066C]{3,})\\s*(?:ریال|تومان|تومن)"
    );
    private static final Pattern AMOUNT_LABELLED = Pattern.compile(
        "(?:مبلغ|برداشت|واریز|خرید|پرداخت|انتقال|بدهکار|بستانکار)\\D{0,12}?([\\d,\\u066C]{3,})"
    );
    private static final Pattern BALANCE = Pattern.compile(
        "(?:مانده|موجودی)\\D{0,12}?[\\d,\\u066C]{3,}"
    );

    /**
     * Display only. The real parse runs in JS on the raw text after the app opens;
     * this just makes the notification recognizable at a glance, and falls back to
     * the bank's own wording when it finds nothing.
     */
    private static String headline(String body, String sender) {
        String text = toAsciiDigits(body);
        // Cut the balance out first, or "موجودی: 115,272,713" wins over the amount
        // in banks that state the amount without a label.
        String scannable = BALANCE.matcher(text).replaceAll(" ");

        Matcher match = AMOUNT_WITH_UNIT.matcher(scannable);
        if (!match.find()) {
            match = AMOUNT_LABELLED.matcher(scannable);
            if (!match.find()) return firstLine(body, sender);
        }

        String amount = match.group(1);
        if (amount == null) return firstLine(body, sender);
        amount = amount.replaceAll("[,\\u066C\\s]", "");
        if (amount.length() > 15) return firstLine(body, sender);

        String unit = text.contains("تومان") || text.contains("تومن") ? "تومان" : "ریال";
        String direction = direction(text);
        return direction + " " + toPersianDigits(group(amount)) + " " + unit;
    }

    private static String direction(String text) {
        // "پرید" / "نشست" are Blu's wording; see src/lib/banks.ts.
        int out = firstIndexOf(
            text,
            new String[] { "پرید", "برداشت", "خرید", "پرداخت", "بدهکار", "کسر" }
        );
        int in = firstIndexOf(text, new String[] { "نشست", "واریز", "بستانکار", "دریافت" });
        if (out >= 0 && (in < 0 || out < in)) return "برداشت";
        if (in >= 0) return "واریز";
        return "تراکنش";
    }

    private static int firstIndexOf(String text, String[] needles) {
        int best = -1;
        for (String needle : needles) {
            int at = text.indexOf(needle);
            if (at >= 0 && (best < 0 || at < best)) best = at;
        }
        return best;
    }

    private static String firstLine(String body, String sender) {
        String line = body.trim();
        int newline = line.indexOf('\n');
        if (newline > 0) line = line.substring(0, newline);
        if (line.length() > 60) line = line.substring(0, 60) + "…";
        return line.isEmpty() ? sender : line;
    }

    private static String group(String digits) {
        StringBuilder out = new StringBuilder();
        int count = 0;
        for (int i = digits.length() - 1; i >= 0; i--) {
            out.append(digits.charAt(i));
            if (++count % 3 == 0 && i > 0) out.append(',');
        }
        return out.reverse().toString();
    }

    private static String toAsciiDigits(String input) {
        StringBuilder out = new StringBuilder(input.length());
        for (char c : input.toCharArray()) {
            if (c >= '۰' && c <= '۹') out.append((char) ('0' + c - '۰'));
            else if (c >= '٠' && c <= '٩') out.append((char) ('0' + c - '٠'));
            else out.append(c);
        }
        return out.toString();
    }

    private static String toPersianDigits(String input) {
        StringBuilder out = new StringBuilder(input.length());
        for (char c : input.toCharArray()) {
            out.append(c >= '0' && c <= '9' ? (char) ('۰' + c - '0') : c);
        }
        return out.toString();
    }
}
