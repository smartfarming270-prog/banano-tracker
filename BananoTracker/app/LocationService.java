package com.banano.tracker;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

public class LocationService extends Service {

    private LocationManager locationManager;
    private Handler handler = new Handler();
    private Location ultimaUbicacion;
    private LocationListener locationListener;
    private String dispositivoID = "Celular_Banano_1";
    private String serverURL = "https://banano-tracker.onrender.com";
    private final IBinder binder = new LocalBinder();

    public class LocalBinder extends Binder {
        LocationService getService() {
            return LocationService.this;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        iniciarRastreo();
        crearNotificacion();
        return START_STICKY;
    }

    private void crearNotificacion() {
        Notification notification = new NotificationCompat.Builder(this, "LocationTracking")
                .setContentTitle("🍌 Rastreador Banano")
                .setContentText("Transmitiendo ubicación...")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build();

        startForeground(1, notification);
    }

    private void iniciarRastreo() {
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);

        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                ultimaUbicacion = location;
            }

            @Override
            public void onProviderEnabled(String provider) {}

            @Override
            public void onProviderDisabled(String provider) {}

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}
        };

        if (ActivityCompat.checkSelfPermission(this,
                Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) {
            locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    15000,
                    0,
                    locationListener
            );
        }

        enviarUbicacionPeriodia();
    }

    private void enviarUbicacionPeriodia() {
        handler.post(new Runnable() {
            @Override
            public void run() {
                // Obtener hora actual
                Calendar calendar = Calendar.getInstance();
                int hora = calendar.get(Calendar.HOUR_OF_DAY);

                // Solo enviar entre 4 AM (4) y 7 PM (19)
                if (hora >= 4 && hora < 19) {
                    if (ultimaUbicacion != null) {
                        enviarUbicacion();
                    }
                }

                handler.postDelayed(this, 15000);
            }
        });
    }

    private void enviarUbicacion() {
        if (ultimaUbicacion == null) return;

        new Thread(() -> {
            try {
                String payload = "{\"id\":\"" + dispositivoID +
                        "\",\"la\":" + ultimaUbicacion.getLatitude() +
                        ",\"lo\":" + ultimaUbicacion.getLongitude() +
                        ",\"ts\":" + System.currentTimeMillis() + "}";

                URL url = new URL(serverURL + "/api/ubicacion");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);

                OutputStream os = conn.getOutputStream();
                os.write(payload.getBytes());
                os.flush();
                os.close();

                int responseCode = conn.getResponseCode();
                android.util.Log.d("BananoApp", "Response code: " + responseCode);
                conn.disconnect();

            } catch (Exception e) {
                android.util.Log.e("BananoApp", "Error: " + e.getMessage());
            }
        }).start();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (locationManager != null && locationListener != null) {
            locationManager.removeUpdates(locationListener);
        }
        handler.removeCallbacksAndMessages(null);
    }
}