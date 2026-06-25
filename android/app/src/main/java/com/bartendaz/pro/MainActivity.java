package com.bartendaz.pro;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfDownloadPlugin.class);
        registerPlugin(YouTubeOverlayPlugin.class);
        super.onCreate(savedInstanceState);

        // Clear WebView cache on every launch so updated APKs always load fresh JS
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().clearCache(true);
        }

        setupImmersiveMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // Only reapply the system bars behavior when focus returns
            // Don't re-setup the entire immersive mode to avoid flashing
            Window window = getWindow();
            View decorView = window.getDecorView();
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, decorView);
            if (controller != null) {
                controller.hide(WindowInsetsCompat.Type.navigationBars());
            }
        }
    }

    private void setupImmersiveMode() {
        Window window = getWindow();
        View decorView = window.getDecorView();

        // Keep screen on — prevents sleep while app is in foreground
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Draw edge-to-edge — app content goes behind status bar AND nav bar
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // Make both bars fully transparent
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }

        // Android 10+ — also kill the nav bar scrim
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        // Use only the modern WindowInsetsController API for cleaner behavior
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            // Dark icons (light bars = false means dark background with light content)
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
            
            // Hide navigation bar (bottom gesture bar)
            controller.hide(WindowInsetsCompat.Type.navigationBars());
            
            // Immersive sticky behavior — swipe up shows nav bar temporarily
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }
}
