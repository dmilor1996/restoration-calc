package com.restoration.calc;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "WorkshopBackup")
public class WorkshopBackup extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("text") == null) { call.reject("Нет данных для копии"); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "workshop.json"));
        startActivityForResult(call, intent, "onFileChosen");
    }

    @ActivityCallback
    private void onFileChosen(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Сохранение отменено"); return;
        }
        getBridge().execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (out == null) throw new IOException();
                out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                call.reject("Не удалось записать файл копии", e); return;
            }
            call.resolve();
        });
    }
}
