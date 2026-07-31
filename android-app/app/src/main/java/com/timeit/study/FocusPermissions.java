package com.timeit.study;

import android.app.AppOpsManager;
import android.content.Context;
import android.os.Process;
import android.provider.Settings;

final class FocusPermissions {
    private FocusPermissions() {}

    static boolean hasUsageAccess(Context context) {
        AppOpsManager manager = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        if (manager == null) return false;
        int mode = manager.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.getPackageName()
        );
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static boolean hasOverlayAccess(Context context) {
        return Settings.canDrawOverlays(context);
    }

    static boolean isReady(Context context) {
        return hasUsageAccess(context) && hasOverlayAccess(context);
    }
}
