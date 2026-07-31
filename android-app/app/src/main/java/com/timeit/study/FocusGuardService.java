package com.timeit.study;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class FocusGuardService extends Service {
    public static final String PREFS = "timeit-focus-guard";
    public static final String KEY_ACTIVE = "focus_active";
    public static final String KEY_PENDING_START = "pending_start";
    public static final String KEY_ALLOWED_PACKAGES = "allowed_packages";
    private static final String ACTION_START = "com.timeit.study.START_FOCUS";
    private static final String ACTION_STOP = "com.timeit.study.STOP_FOCUS";
    private static final int NOTIFICATION_ID = 7104;
    private static final String CHANNEL_ID = "timeit-focus";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> systemAllowlist = new HashSet<>();
    private WindowManager windowManager;
    private View blockerView;
    private TextView blockedAppText;
    private String shownPackage;
    private boolean running;

    public static void start(Context context) {
        Intent intent = new Intent(context, FocusGuardService.class).setAction(ACTION_START);
        context.startForegroundService(intent);
    }

    public static void stop(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean wasActive = preferences.getBoolean(KEY_ACTIVE, false)
                || preferences.getBoolean(KEY_PENDING_START, false);
        preferences
                .edit()
                .putBoolean(KEY_ACTIVE, false)
                .putBoolean(KEY_PENDING_START, false)
                .apply();
        if (!wasActive) return;
        context.startService(new Intent(context, FocusGuardService.class).setAction(ACTION_STOP));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        buildSystemAllowlist();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopGuard();
            return START_NOT_STICKY;
        }
        if (!FocusPermissions.isReady(this)) {
            stopGuard();
            return START_NOT_STICKY;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ACTIVE, true)
                .putBoolean(KEY_PENDING_START, false)
                .apply();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        running = true;
        handler.removeCallbacks(checkForegroundApp);
        handler.post(checkForegroundApp);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        hideBlocker();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, false).apply();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private final Runnable checkForegroundApp = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            if (!FocusPermissions.isReady(FocusGuardService.this)) {
                stopGuard();
                return;
            }
            String foregroundPackage = findForegroundPackage();
            if (foregroundPackage != null) {
                if (isAllowed(foregroundPackage)) hideBlocker();
                else showBlocker(foregroundPackage);
            }
            handler.postDelayed(this, 450);
        }
    };

    private String findForegroundPackage() {
        UsageStatsManager manager = (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
        if (manager == null) return null;
        long end = System.currentTimeMillis();
        UsageEvents events = manager.queryEvents(end - 8_000, end);
        UsageEvents.Event event = new UsageEvents.Event();
        String latestPackage = null;
        long latestTime = 0;
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            int eventType = event.getEventType();
            if ((eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
                    || eventType == UsageEvents.Event.ACTIVITY_RESUMED)
                    && event.getTimeStamp() >= latestTime) {
                latestTime = event.getTimeStamp();
                latestPackage = event.getPackageName();
            }
        }
        return latestPackage;
    }

    private boolean isAllowed(String packageName) {
        if (systemAllowlist.contains(packageName)) return true;
        Set<String> selected = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getStringSet(KEY_ALLOWED_PACKAGES, Collections.emptySet());
        return selected.contains(packageName);
    }

    private void buildSystemAllowlist() {
        systemAllowlist.add(getPackageName());
        systemAllowlist.add("com.android.systemui");
        systemAllowlist.add("com.android.permissioncontroller");
        systemAllowlist.add("com.google.android.permissioncontroller");
        systemAllowlist.add("com.samsung.android.permissioncontroller");
        systemAllowlist.add("com.android.packageinstaller");
        systemAllowlist.add("com.google.android.packageinstaller");

        TelecomManager telecom = (TelecomManager) getSystemService(TELECOM_SERVICE);
        if (telecom != null && telecom.getDefaultDialerPackage() != null) {
            systemAllowlist.add(telecom.getDefaultDialerPackage());
        }
        Intent dialIntent = new Intent(Intent.ACTION_DIAL);
        ResolveInfo dialer = getPackageManager().resolveActivity(dialIntent, 0);
        if (dialer != null && dialer.activityInfo != null) {
            systemAllowlist.add(dialer.activityInfo.packageName);
        }
        String inputMethod = Settings.Secure.getString(
                getContentResolver(),
                Settings.Secure.DEFAULT_INPUT_METHOD
        );
        if (inputMethod != null && inputMethod.contains("/")) {
            systemAllowlist.add(inputMethod.substring(0, inputMethod.indexOf('/')));
        }
    }

    private void showBlocker(String packageName) {
        if (!Settings.canDrawOverlays(this)) return;
        if (blockerView == null) createBlockerView();
        if (packageName.equals(shownPackage) && blockerView.getWindowToken() != null) return;
        shownPackage = packageName;
        blockedAppText.setText(getString(R.string.blocked_app_message, appLabel(packageName)));
        if (blockerView.getWindowToken() == null) {
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.TOP | Gravity.START;
            try {
                windowManager.addView(blockerView, params);
            } catch (Exception ignored) {
            }
        }
    }

    private void createBlockerView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(30), dp(40), dp(30), dp(40));
        root.setBackgroundColor(Color.rgb(21, 25, 27));

        TextView mark = text("T", 25, Color.WHITE, true);
        GradientDrawable markBackground = rounded(Color.rgb(218, 139, 118), 22);
        mark.setBackground(markBackground);
        mark.setGravity(Gravity.CENTER);
        root.addView(mark, new LinearLayout.LayoutParams(dp(64), dp(64)));

        TextView title = text("지금은 집중할 시간이에요", 25, Color.rgb(248, 244, 238), true);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(26), 0, dp(10));
        root.addView(title);

        blockedAppText = text("", 13, Color.rgb(166, 176, 172), false);
        blockedAppText.setGravity(Gravity.CENTER);
        root.addView(blockedAppText);

        TextView note = text(
                "타임잇 타이머를 중지하면 모든 앱을 다시 사용할 수 있어요.",
                12,
                Color.rgb(126, 137, 133),
                false
        );
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, dp(8), 0, dp(25));
        root.addView(note);

        Button back = new Button(this);
        back.setText("타임잇으로 돌아가기");
        back.setTextSize(14);
        back.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        back.setTextColor(Color.rgb(35, 41, 43));
        back.setAllCaps(false);
        back.setBackground(rounded(Color.rgb(241, 236, 229), 16));
        back.setOnClickListener(v -> {
            Intent intent = new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        });
        root.addView(back, new LinearLayout.LayoutParams(-1, dp(54)));
        blockerView = root;
    }

    private void hideBlocker() {
        shownPackage = null;
        if (blockerView != null && blockerView.getWindowToken() != null) {
            try {
                windowManager.removeView(blockerView);
            } catch (Exception ignored) {
            }
        }
    }

    private void stopGuard() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        hideBlocker();
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ACTIVE, false)
                .putBoolean(KEY_PENDING_START, false)
                .apply();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private Notification buildNotification() {
        PendingIntent openApp = PendingIntent.getActivity(
                this,
                0,
                new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(com.timeit.study.R.drawable.ic_notification)
                .setContentTitle("타임잇 집중 앱 차단 중")
                .setContentText("허용한 앱 외에는 집중 화면이 표시됩니다.")
                .setContentIntent(openApp)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "집중 앱 차단",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("타임잇 집중 세션이 실행 중임을 표시합니다.");
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private String appLabel(String packageName) {
        try {
            PackageManager manager = getPackageManager();
            ApplicationInfo info = manager.getApplicationInfo(packageName, 0);
            CharSequence label = manager.getApplicationLabel(info);
            return label == null ? packageName : label.toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
