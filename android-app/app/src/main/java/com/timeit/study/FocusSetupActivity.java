package com.timeit.study;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class FocusSetupActivity extends Activity {
    private LinearLayout statusContainer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(32, 38, 40));
        getWindow().setNavigationBarColor(Color.rgb(32, 38, 40));
        setContentView(buildContent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
        boolean pending = getSharedPreferences(FocusGuardService.PREFS, MODE_PRIVATE)
                .getBoolean(FocusGuardService.KEY_PENDING_START, false);
        if (pending && FocusPermissions.isReady(this)) {
            getSharedPreferences(FocusGuardService.PREFS, MODE_PRIVATE)
                    .edit()
                    .putBoolean(FocusGuardService.KEY_PENDING_START, false)
                    .apply();
            FocusGuardService.start(this);
            finish();
        }
    }

    private View buildContent() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(32, 38, 40));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(28), dp(24), dp(32));
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        TextView eyebrow = text("FOCUS GUARD", 12, Color.rgb(226, 151, 130), true);
        root.addView(eyebrow);
        TextView title = text("집중 앱 차단 준비", 28, Color.rgb(248, 244, 238), true);
        title.setPadding(0, dp(8), 0, dp(7));
        root.addView(title);
        TextView description = text(
                "타이머가 실행되는 동안 허용하지 않은 앱을 감지해 집중 화면으로 덮습니다. 아래 두 권한은 휴대폰에서 최초 한 번만 허용하면 됩니다.",
                14,
                Color.rgb(184, 190, 187),
                false
        );
        description.setLineSpacing(0, 1.35f);
        root.addView(description);

        statusContainer = new LinearLayout(this);
        statusContainer.setOrientation(LinearLayout.VERTICAL);
        statusContainer.setPadding(0, dp(24), 0, dp(10));
        root.addView(statusContainer);

        root.addView(actionButton("1. 앱 사용 정보 접근 허용", () -> {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        }));
        root.addView(actionButton("2. 다른 앱 위에 표시 허용", () -> {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
        }));
        root.addView(actionButton("허용 앱 선택", () ->
                startActivity(new Intent(this, AllowedAppsActivity.class))
        ));

        TextView privacy = text(
                "타임잇은 앱 이름과 실행 여부만 기기 안에서 확인합니다. 사용 내용이나 화면 정보는 읽거나 서버로 전송하지 않습니다. 전화와 긴급 기능은 항상 허용됩니다.",
                12,
                Color.rgb(142, 151, 148),
                false
        );
        privacy.setPadding(0, dp(18), 0, dp(20));
        privacy.setLineSpacing(0, 1.35f);
        root.addView(privacy);

        Button done = actionButton("타임잇으로 돌아가기", this::finish);
        done.setTextColor(Color.rgb(35, 41, 43));
        done.setBackgroundColor(Color.rgb(241, 236, 229));
        root.addView(done);
        return scroll;
    }

    private void refreshStatus() {
        if (statusContainer == null) return;
        statusContainer.removeAllViews();
        statusContainer.addView(statusLine(
                FocusPermissions.hasUsageAccess(this),
                "앱 사용 정보",
                "현재 실행 중인 앱만 감지"
        ));
        statusContainer.addView(statusLine(
                FocusPermissions.hasOverlayAccess(this),
                "차단 화면 표시",
                "허용하지 않은 앱 위에 집중 화면 표시"
        ));
    }

    private View statusLine(boolean enabled, String title, String detail) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(12), dp(14), dp(12));
        row.setBackgroundColor(Color.rgb(43, 51, 52));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(8);
        row.setLayoutParams(params);

        TextView dot = text(enabled ? "●" : "○", 17, enabled ? Color.rgb(112, 179, 139) : Color.rgb(218, 139, 118), true);
        dot.setPadding(0, 0, dp(12), 0);
        row.addView(dot);
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.addView(text(title, 14, Color.rgb(243, 239, 233), true));
        copy.addView(text((enabled ? "허용됨 · " : "설정 필요 · ") + detail, 11, Color.rgb(164, 173, 169), false));
        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        return row;
    }

    private Button actionButton(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(Color.rgb(245, 241, 235));
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setBackgroundColor(Color.rgb(56, 65, 66));
        button.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52));
        params.bottomMargin = dp(10);
        button.setLayoutParams(params);
        return button;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
