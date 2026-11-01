package th.seafishingclub.v2nmapmaker;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.WindowManager;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Arrays;

/** V2N Map Maker: the web editor (assets/www/editor) in a WebView, served from https://appassets.androidplatform.net so
 *  ES modules work; a small bridge saves map files / PNGs to Download and opens the share sheet (send to Claude). */
public class MainActivity extends Activity {
    private static final int PICK = 41;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private long lastBackPress = 0L;

    private void applyGameFullscreen() {
        if (!BuildConfig.IS_GAME) return;
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (BuildConfig.IS_GAME) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            applyGameFullscreen();
        }
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                boolean images = Arrays.toString(p.getAcceptTypes()).contains("image");
                i.setType(images ? "image/*" : "*/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, images ? "เลือกรูป" : "เลือกไฟล์"), PICK); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        if (b != null) web.restoreState(b);
        else web.loadUrl("https://appassets.androidplatform.net/assets/www/" + BuildConfig.START);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyGameFullscreen();
    }

    @Override protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        applyGameFullscreen();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    out = new Uri[data.getClipData().getItemCount()];
                    for (int k = 0; k < out.length; k++) out[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) out = new Uri[] { data.getData() };
            }
            fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override public void onBackPressed() {
        if (BuildConfig.IS_GAME) {
            // First press is Escape (close dialog/menus); second within 2s exits the app.
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - lastBackPress < 2000) { super.onBackPressed(); return; }
            lastBackPress = now;
            web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));", null);
            Toast.makeText(this, "กดกลับอีกครั้งเพื่อออกจากเกม", Toast.LENGTH_SHORT).show();
            return;
        }
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    class Bridge {
        @JavascriptInterface public void saveFile(String name, String mime, String b64) {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                Uri uri;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/V2N");
                    uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    try (OutputStream o = getContentResolver().openOutputStream(uri)) { o.write(bytes); }
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, name);
                    try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); }
                    uri = null;
                }
                final Uri shared = uri;
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "บันทึกแล้ว: Download/V2N/" + name, Toast.LENGTH_LONG).show();
                    if (shared != null) {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(mime);
                        send.putExtra(Intent.EXTRA_STREAM, shared);
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "ส่งไฟล์แมพ (เช่น ส่งให้ Claude)"));
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "บันทึกไม่ได้: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }
    }
}
