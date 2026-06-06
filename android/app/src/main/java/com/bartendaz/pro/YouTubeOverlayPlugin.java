package com.bartendaz.pro;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * YouTubeOverlayPlugin
 *
 * Adds a persistent native WebView that sits BEHIND the main Capacitor WebView.
 * JS can call:
 *   show()   — bring it to front (above the Capacitor view)
 *   hide()   — push it behind (invisible, audio keeps playing)
 *   open(url) — load a URL (call once to initialise YouTube)
 *
 * The WebView is never destroyed until the app exits, so music always continues.
 */
@CapacitorPlugin(name = "YouTubeOverlay")
public class YouTubeOverlayPlugin extends Plugin {

    private WebView overlayWebView;
    private boolean isVisible = false;
    private boolean isInitialised = false;

    // ── Initialise — creates the WebView and adds it BEHIND the main view ──
    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void initialise(PluginCall call) {
        if (isInitialised) {
            call.resolve();
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                // The root view of the activity that holds the Capacitor WebView
                ViewGroup root = (ViewGroup) getActivity().getWindow().getDecorView()
                        .findViewById(android.R.id.content);

                // Create a full-screen FrameLayout container for our overlay
                FrameLayout container = new FrameLayout(getActivity());
                container.setLayoutParams(new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                container.setTag("yt_overlay_container");
                container.setVisibility(View.GONE); // hidden by default

                // Create the WebView
                overlayWebView = new WebView(getActivity());
                overlayWebView.setLayoutParams(new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                // Configure WebView for YouTube
                WebSettings settings = overlayWebView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setLoadWithOverviewMode(true);
                settings.setUseWideViewPort(true);
                settings.setAllowFileAccess(false);
                settings.setGeolocationEnabled(false);
                // Make it look like a real browser to avoid YouTube's "unsupported browser" block
                settings.setUserAgentString(
                    "Mozilla/5.0 (Linux; Android 11; Pixel 5) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/120.0.0.0 Mobile Safari/537.36");

                // Handle page navigation inside the WebView (don't open Chrome)
                overlayWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        // Keep everything inside our WebView
                        return false;
                    }
                });

                // Support full-screen video if the user requests it
                overlayWebView.setWebChromeClient(new WebChromeClient() {
                    private View customView;
                    private CustomViewCallback customViewCallback;

                    @Override
                    public void onShowCustomView(View view, CustomViewCallback callback) {
                        customView = view;
                        customViewCallback = callback;
                        root.addView(view, new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT));
                        overlayWebView.setVisibility(View.GONE);
                    }

                    @Override
                    public void onHideCustomView() {
                        if (customView != null) {
                            root.removeView(customView);
                            customView = null;
                        }
                        if (customViewCallback != null) {
                            customViewCallback.onCustomViewHidden();
                        }
                        overlayWebView.setVisibility(View.VISIBLE);
                    }
                });

                container.addView(overlayWebView);

                // Insert BEFORE the main Capacitor view (index 0 = behind everything)
                root.addView(container, 0);

                isInitialised = true;
                call.resolve();

            } catch (Exception e) {
                call.reject("Failed to initialise overlay: " + e.getMessage());
            }
        });
    }

    // ── Open a URL in the overlay ─────────────────────────────────────────
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "https://m.youtube.com");
        ensureInitialised(() -> {
            getActivity().runOnUiThread(() -> {
                overlayWebView.loadUrl(url);
                call.resolve();
            });
        }, call);
    }

    // ── Show the overlay (bring in front of Capacitor view) ───────────────
    @PluginMethod
    public void show(PluginCall call) {
        ensureInitialised(() -> {
            getActivity().runOnUiThread(() -> {
                View container = getActivity().getWindow().getDecorView()
                        .findViewWithTag("yt_overlay_container");
                if (container != null) {
                    container.setVisibility(View.VISIBLE);
                    // Raise the container above the Capacitor WebView
                    container.bringToFront();
                    container.requestLayout();
                }
                isVisible = true;
                call.resolve();
            });
        }, call);
    }

    // ── Hide the overlay (push behind — audio keeps playing) ──────────────
    @PluginMethod
    public void hide(PluginCall call) {
        if (!isInitialised) { call.resolve(); return; }
        getActivity().runOnUiThread(() -> {
            View container = getActivity().getWindow().getDecorView()
                    .findViewWithTag("yt_overlay_container");
            if (container != null) {
                container.setVisibility(View.GONE);
            }
            isVisible = false;
            call.resolve();
        });
    }

    // ── Query current state ───────────────────────────────────────────────
    @PluginMethod
    public void getState(PluginCall call) {
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("visible", isVisible);
        ret.put("initialised", isInitialised);
        call.resolve(ret);
    }

    // ── Helper: initialise first if not already done ──────────────────────
    private void ensureInitialised(Runnable then, PluginCall call) {
        if (isInitialised) {
            then.run();
            return;
        }
        getActivity().runOnUiThread(() -> {
            // Re-use initialise logic inline
            PluginCall fakeCall = new PluginCall(null, null, null, null, null) {
                @Override public void resolve() { then.run(); }
                @Override public void reject(String msg) { call.reject(msg); }
            };
            initialise(fakeCall);
        });
    }
}
