package com.bartendaz.pro;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * PdfDownloadPlugin
 *
 * Saves a base64-encoded PDF to the public Downloads folder using
 * Android's DownloadManager, which automatically shows:
 *   - A progress notification in the status bar while saving
 *   - A "Download complete" notification when done
 *   - A tap-to-open action that opens the PDF in the default viewer
 */
@CapacitorPlugin(name = "PdfDownload")
public class PdfDownloadPlugin extends Plugin {

    @PluginMethod
    public void downloadPdf(PluginCall call) {
        String base64 = call.getString("base64");
        String filename = call.getString("filename", "statement.pdf");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing base64 data");
            return;
        }

        // Strip data URI prefix if present
        if (base64.contains(",")) {
            base64 = base64.substring(base64.indexOf(",") + 1);
        }

        try {
            // Decode base64 to bytes
            byte[] pdfBytes = Base64.decode(base64, Base64.DEFAULT);

            // Write to a temp file in cache first
            Context ctx = getContext();
            File cacheDir = ctx.getCacheDir();
            File tempFile = new File(cacheDir, filename);
            FileOutputStream fos = new FileOutputStream(tempFile);
            fos.write(pdfBytes);
            fos.close();

            // Use DownloadManager to move it to Downloads with a notification
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);

            // On Android 10+ we can write directly to Downloads via DownloadManager
            // by using a file:// URI from cache and letting DM copy it
            // Actually we write directly to Downloads folder
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!downloadsDir.exists()) downloadsDir.mkdirs();

            File destFile = new File(downloadsDir, filename);
            // If file exists, add a number suffix
            int counter = 1;
            while (destFile.exists()) {
                String nameNoExt = filename.replace(".pdf", "");
                destFile = new File(downloadsDir, nameNoExt + "(" + counter + ").pdf");
                counter++;
            }

            // Write directly to Downloads
            FileOutputStream destFos = new FileOutputStream(destFile);
            destFos.write(pdfBytes);
            destFos.close();

            // Tell DownloadManager about the file so it shows the notification
            DownloadManager.Request request = new DownloadManager.Request(Uri.fromFile(destFile));
            request.setTitle(filename);
            request.setDescription("Bartendaz Pro statement");
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setDestinationUri(Uri.fromFile(destFile));
            request.setMimeType("application/pdf");

            // Re-scan the file so it appears in Downloads app
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // On Android 10+ use MediaStore scan via DownloadManager
                dm.addCompletedDownload(
                    filename,
                    "Bartendaz Pro statement",
                    true,
                    "application/pdf",
                    destFile.getAbsolutePath(),
                    destFile.length(),
                    true  // showNotification
                );
            } else {
                dm.addCompletedDownload(
                    filename,
                    "Bartendaz Pro statement",
                    true,
                    "application/pdf",
                    destFile.getAbsolutePath(),
                    destFile.length(),
                    true
                );
            }

            // Clean up temp file
            tempFile.delete();

            call.resolve();

        } catch (Exception e) {
            call.reject("Download failed: " + e.getMessage());
        }
    }
}
