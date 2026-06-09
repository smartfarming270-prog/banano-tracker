package com.banano.tracker;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

public class MainActivity extends AppCompatActivity {

    private LocationManager locationManager;
    private Handler handler = new Handler();
    private Location ultimaUbicacion;
    private TextView statusText;
    private LocationListener locationListener;
    private String dispositivoID = "Celular_Banano_1";
    private String serverURL = "https://banano-tracker.onrender.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.statusText);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);

        if (ActivityCompat.checkSelfPermission(this,
                Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 1);
            return;
        }

        iniciarRastreo();
    }

    private void iniciarRastreo() {
        statusText.setText("🚀 Iniciando rastreo...");

        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                ultimaUbicacion = location;
                statusText.setText("📍 Última ubicación:\nLat: " + location.getLatitude() + "\nLng: " + location.getLongitude());
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
                    } else {
                        statusText.setText("⏳ Esperando ubicación GPS...");
                    }
                } else {
                    statusText.setText("🌙 Fuera de horario (4 AM - 7 PM)");
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

                runOnUiThread(() -> {
                    if (responseCode == 200) {
                        statusText.setText("✅ Ubicación enviada\nLat: " + ultimaUbicacion.getLatitude() + "\nLng: " + ultimaUbicacion.getLongitude());
                    } else {
                        statusText.setText("⚠️ Código: " + responseCode);
                    }
                });

                conn.disconnect();

            } catch (Exception e) {
                android.util.Log.e("BananoApp", "Error: " + e.getMessage());
                runOnUiThread(() -> {
                    statusText.setText("❌ Error: " + e.getMessage());
                });
            }
        }).start();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            iniciarRastreo();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (locationManager != null && locationListener != null) {
            locationManager.removeUpdates(locationListener);
        }
    }
}