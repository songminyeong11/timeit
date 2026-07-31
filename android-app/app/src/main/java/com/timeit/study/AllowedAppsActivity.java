package com.timeit.study;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class AllowedAppsActivity extends Activity {
    private SharedPreferences preferences;
    private Set<String> allowedPackages;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(32, 38, 40));
        getWindow().setNavigationBarColor(Color.rgb(32, 38, 40));
        preferences = getSharedPreferences(FocusGuardService.PREFS, MODE_PRIVATE);
        allowedPackages = new HashSet<>(preferences.getStringSet(
                FocusGuardService.KEY_ALLOWED_PACKAGES,
                Collections.emptySet()
        ));
        setContentView(buildContent());
    }

    private View buildContent() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(32, 38, 40));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(22), dp(24), dp(22), dp(14));
        TextView title = text("허용 앱", 25, Color.rgb(247, 243, 237), true);
        header.addView(title);
        TextView detail = text(
                "집중 중에도 사용할 앱만 선택하세요. 전화와 긴급 시스템 기능은 항상 허용됩니다.",
                12,
                Color.rgb(163, 172, 168),
                false
        );
        detail.setPadding(0, dp(7), 0, 0);
        detail.setLineSpacing(0, 1.3f);
        header.addView(detail);
        root.addView(header);

        List<AppEntry> entries = loadApps();
        ListView list = new ListView(this);
        list.setDividerHeight(1);
        list.setDivider(new android.graphics.drawable.ColorDrawable(Color.rgb(53, 61, 62)));
        list.setAdapter(new AppAdapter(entries));
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));

        TextView footer = text("선택 내용은 이 휴대폰에만 저장됩니다.", 11, Color.rgb(136, 145, 142), false);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(dp(16), dp(12), dp(16), dp(18));
        root.addView(footer);
        return root;
    }

    private List<AppEntry> loadApps() {
        PackageManager packageManager = getPackageManager();
        Intent launcherIntent = new Intent(Intent.ACTION_MAIN);
        launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> resolved = packageManager.queryIntentActivities(launcherIntent, 0);
        List<AppEntry> apps = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (ResolveInfo info : resolved) {
            String packageName = info.activityInfo.packageName;
            if (packageName.equals(getPackageName()) || !seen.add(packageName)) continue;
            CharSequence label = info.loadLabel(packageManager);
            Drawable icon = info.loadIcon(packageManager);
            apps.add(new AppEntry(label == null ? packageName : label.toString(), packageName, icon));
        }
        Collator collator = Collator.getInstance(Locale.KOREAN);
        apps.sort((a, b) -> collator.compare(a.label, b.label));
        return apps;
    }

    private void togglePackage(String packageName, boolean allowed) {
        if (allowed) allowedPackages.add(packageName);
        else allowedPackages.remove(packageName);
        preferences.edit()
                .putStringSet(FocusGuardService.KEY_ALLOWED_PACKAGES, new HashSet<>(allowedPackages))
                .apply();
    }

    private final class AppAdapter extends ArrayAdapter<AppEntry> {
        AppAdapter(List<AppEntry> entries) {
            super(AllowedAppsActivity.this, android.R.layout.simple_list_item_1, entries);
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            AppEntry entry = getItem(position);
            LinearLayout row = new LinearLayout(AllowedAppsActivity.this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(20), dp(11), dp(16), dp(11));
            row.setBackgroundColor(Color.rgb(37, 44, 46));

            ImageView icon = new ImageView(AllowedAppsActivity.this);
            icon.setImageDrawable(entry.icon);
            row.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(40)));

            LinearLayout copy = new LinearLayout(AllowedAppsActivity.this);
            copy.setOrientation(LinearLayout.VERTICAL);
            copy.setPadding(dp(13), 0, dp(8), 0);
            copy.addView(text(entry.label, 14, Color.rgb(241, 237, 231), true));
            copy.addView(text(entry.packageName, 10, Color.rgb(126, 137, 134), false));
            row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));

            CheckBox checkBox = new CheckBox(AllowedAppsActivity.this);
            checkBox.setChecked(allowedPackages.contains(entry.packageName));
            checkBox.setButtonTintList(new android.content.res.ColorStateList(
                    new int[][]{new int[]{android.R.attr.state_checked}, new int[]{}},
                    new int[]{Color.rgb(218, 139, 118), Color.rgb(99, 109, 107)}
            ));
            checkBox.setOnCheckedChangeListener((button, checked) ->
                    togglePackage(entry.packageName, checked)
            );
            row.setOnClickListener(v -> checkBox.setChecked(!checkBox.isChecked()));
            row.addView(checkBox);
            return row;
        }
    }

    private static final class AppEntry {
        final String label;
        final String packageName;
        final Drawable icon;

        AppEntry(String label, String packageName, Drawable icon) {
            this.label = label;
            this.packageName = packageName;
            this.icon = icon;
        }
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setSingleLine(true);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
