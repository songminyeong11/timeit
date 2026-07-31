package com.timeit.study;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String TIMEIT_URL = "https://timeit.songminyeong11.workers.dev/";
    private static final String TIMEIT_HOST = "timeit.songminyeong11.workers.dev";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(32, 38, 40));
        getWindow().setNavigationBarColor(Color.rgb(32, 38, 40));

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " TimeitAndroid/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new TimeitFocusBridge(), "TimeitFocusNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equals(scheme) && TIMEIT_HOST.equalsIgnoreCase(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        if (savedInstanceState == null) webView.loadUrl(TIMEIT_URL);
        else webView.restoreState(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 41);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBackNavigation
            );
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('timeitFocusStatusChanged'))",
                    null
            );
        }
    }

    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    private void handleBackNavigation() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    private void openActivity(Class<?> activityClass) {
        runOnUiThread(() -> startActivity(new Intent(MainActivity.this, activityClass)));
    }

    private final class TimeitFocusBridge {
        @JavascriptInterface
        public String getStatus() {
            return buildStatusJson();
        }

        @JavascriptInterface
        public String startFocus() {
            SharedPreferences preferences = getSharedPreferences(FocusGuardService.PREFS, MODE_PRIVATE);
            if (!FocusPermissions.isReady(MainActivity.this)) {
                preferences.edit().putBoolean(FocusGuardService.KEY_PENDING_START, true).apply();
                openActivity(FocusSetupActivity.class);
                return buildStatusJson();
            }
            FocusGuardService.start(MainActivity.this);
            return buildStatusJson();
        }

        @JavascriptInterface
        public void stopFocus() {
            FocusGuardService.stop(MainActivity.this);
        }

        @JavascriptInterface
        public void openAllowedApps() {
            openActivity(AllowedAppsActivity.class);
        }

        @JavascriptInterface
        public void openFocusSetup() {
            openActivity(FocusSetupActivity.class);
        }
    }

    private String buildStatusJson() {
        SharedPreferences preferences = getSharedPreferences(FocusGuardService.PREFS, MODE_PRIVATE);
        JSONObject status = new JSONObject();
        try {
            status.put("native", true);
            status.put("usageAccess", FocusPermissions.hasUsageAccess(this));
            status.put("overlayAccess", FocusPermissions.hasOverlayAccess(this));
            status.put("ready", FocusPermissions.isReady(this));
            status.put("active", preferences.getBoolean(FocusGuardService.KEY_ACTIVE, false));
            status.put("allowedCount", preferences.getStringSet(
                    FocusGuardService.KEY_ALLOWED_PACKAGES,
                    java.util.Collections.emptySet()
            ).size());
        } catch (JSONException ignored) {
        }
        return status.toString();
    }
}
