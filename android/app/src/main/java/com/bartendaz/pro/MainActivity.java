package com.bartendaz.pro;

import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean keyboardVisible = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(android.graphics.Color.BLACK);
            window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        }

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }

        // Listen for keyboard visibility changes
        ViewCompat.setOnApplyWindowInsetsListener(window.getDecorView(), (v, insets) -> {
            keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            if (!keyboardVisible) {
                hideNavBar();
            }
            return insets;
        });

        hideNavBar();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!keyboardVisible) hideNavBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !keyboardVisible) hideNavBar();
    }

    private void hideNavBar() {
        Window window = getWindow();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.navigationBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }
}
