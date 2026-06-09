const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const ubicacionesActuales = {};

function guardarUbicacion(ubicacion) {
    const hoy = new Date().toISOString().split('T')[0];
    const archivo = path.join(dataDir, `historial_${ubicacion.dispositivo}_${hoy}.json`);
    
    let historial = [];
    if (fs.existsSync(archivo)) {
        historial = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    }
    
    historial.push({
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        timestamp: ubicacion.timestamp,
        hora: new Date(new Date(ubicacion.timestamp).getTime() - (6 * 60 * 60 * 1000)).toLocaleTimeString('es-CR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    
    fs.writeFileSync(archivo, JSON.stringify(historial, null, 2));
}

app.post('/api/ubicacion', (req, res) => {
    console.log('RECIBIDO:', req.body);  // 
    const { id, la, lo, ts } = req.body;
    
    if (!id || !la || !lo) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    const ubicacion = {
        dispositivo: id,
        lat: parseFloat(la),
        lng: parseFloat(lo),
        timestamp: ts || Date.now(),
        hora: new Date(new Date().getTime() - (6 * 60 * 60 * 1000)).toLocaleTimeString('es-CR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    
    ubicacionesActuales[id] = ubicacion;
    guardarUbicacion(ubicacion);
    
    console.log(` [${ubicacion.hora}] ${id} → Lat: ${la}, Lng: ${lo}`);
    
    broadcast();
    res.json({ ok: true });
});

app.get('/api/ubicaciones', (req, res) => {
    res.json({
        total: Object.keys(ubicacionesActuales).length,
        ubicaciones: Object.values(ubicacionesActuales)
    });
});

app.get('/api/historial/:dispositivo', (req, res) => {
    const dispositivo = req.params.dispositivo;
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    
    const archivo = path.join(dataDir, `historial_${dispositivo}_${fecha}.json`);
    
    if (!fs.existsSync(archivo)) {
        return res.json({ historial: [], fecha, dispositivo });
    }
    
    const historial = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    res.json({ historial, fecha, dispositivo });
});

app.get('/api/fechas/:dispositivo', (req, res) => {
    const dispositivo = req.params.dispositivo;
    const archivos = fs.readdirSync(dataDir);
    
    const fechas = archivos
        .filter(f => f.startsWith(`historial_${dispositivo}_`))
        .map(f => f.replace(`historial_${dispositivo}_`, '').replace('.json', ''))
        .sort()
        .reverse();
    
    res.json({ fechas, dispositivo });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🍌 Rastreo Banano - Historial de Ruta</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        html, body { height: 100%; }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container { max-width: 1600px; margin: 0 auto; }
        
        header {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        h1 { color: #333; margin-bottom: 10px; }
        
        .controles {
            display: flex;
            gap: 15px;
            margin-top: 15px;
            flex-wrap: wrap;
        }
        
        select, button {
            padding: 10px 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
            cursor: pointer;
            background: white;
        }
        
        button {
            background: #667eea;
            color: white;
            border: none;
            font-weight: bold;
        }
        
        button:hover { background: #764ba2; }
        
        .contenedor-principal {
            display: grid;
            grid-template-columns: 3fr 1fr;
            gap: 20px;
        }
        
        #map {
            width: 100%;
            height: 600px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            background: #e0e0e0;
        }
        
        .panel-info {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .panel-info h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        
        .estadisticas {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 15px;
        }
        
        .estadistica-item {
            padding: 10px 0;
            border-bottom: 1px solid #eee;
            font-size: 14px;
        }
        
        .estadistica-item strong { color: #667eea; }
        
        .listado-puntos {
            max-height: 400px;
            overflow-y: auto;
            font-size: 12px;
        }
        
        .punto {
            padding: 8px;
            margin-bottom: 5px;
            background: #f0f0f0;
            border-left: 3px solid #667eea;
            border-radius: 3px;
            cursor: pointer;
        }
        
        .punto:hover { background: #e8e8e8; }
        
        .conexion-status {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            margin-top: 10px;
        }
        
        .conexion-status.conectado {
            background: #4CAF50;
            color: white;
        }
        
        .conexion-status.desconectado {
            background: #f44336;
            color: white;
        }
        
        @media (max-width: 1024px) {
            .contenedor-principal {
                grid-template-columns: 1fr;
            }
            #map { height: 400px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🍌 RASTREO BANANO - HISTORIAL DE RUTA</h1>
            <div class="controles">
                <select id="selectDispositivo">
                    <option value="">Seleccionar dispositivo...</option>
                </select>
                <input type="date" id="selectFecha">
                <button onclick="cargarHistorial()"> Cargar Ruta</button>
                <button onclick="cargarActual()"> Ubicación Actual</button>
            </div>
            <div id="estadoConexion" class="conexion-status desconectado">
                🔴 Conectando...
            </div>
        </header>
        
        <div class="contenedor-principal">
            <div id="map"></div>
            <div class="panel-info">
                <h2> Estadísticas</h2>
                <div id="estadisticas" class="estadisticas">
                    <div class="estadistica-item">Total de puntos: <strong id="totalPuntos">0</strong></div>
                    <div class="estadistica-item">Hora inicio: <strong id="horaInicio">--:--:--</strong></div>
                    <div class="estadistica-item">Hora fin: <strong id="horaFin">--:--:--</strong></div>
                    <div class="estadistica-item">Tiempo total: <strong id="tiempoTotal">0h 0m</strong></div>
                    <div class="estadistica-item">Distancia aprox: <strong id="distancia">0 km</strong></div>
                </div>
                
                <h2 style="margin-top: 20px;"> Ruta Completa</h2>
                <div class="modo-vista" style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #ddd;">
                    <button onclick="mostrarTodo()" style="width: 100%; margin-bottom: 10px;">Ver toda la ruta</button>
                    <button onclick="mostrarUltimos30()" style="width: 100%;">Últimos 30 min</button>
                </div>
                
                <h2 style="margin-top: 20px;"> Puntos de Ruta</h2>
                <div id="listadoPuntos" class="listado-puntos">
                    <p style="color: #999;">Selecciona un dispositivo y fecha...</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        let map;
        let markers = {};
        let polylines = {};
        let historialActual = [];
        let wsConectado = false;
        let dispositivos = new Set();
        
        function iniciarMapa() {
            map = L.map('map').setView([9.7489, -83.7534], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);
        }
        
        function conectarWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(protocol + '//' + window.location.host);
            
            ws.onopen = () => {
                wsConectado = true;
                document.getElementById('estadoConexion').textContent = '🟢 Conectado';
                document.getElementById('estadoConexion').className = 'conexion-status conectado';
                cargarDispositivos();
            };
            
            ws.onmessage = (event) => {
                try {
                    const ubicaciones = JSON.parse(event.data);
                    ubicaciones.forEach(u => {
                        dispositivos.add(u.dispositivo);
                        actualizarSelectDispositivos();
                    });
                } catch (e) {}
            };
            
            ws.onclose = () => {
                wsConectado = false;
                document.getElementById('estadoConexion').textContent = '🔴 Reconectando...';
                setTimeout(conectarWebSocket, 3000);
            };
        }
        
        async function cargarDispositivos() {
            try {
                const res = await fetch('/api/ubicaciones');
                const data = await res.json();
                data.ubicaciones.forEach(u => dispositivos.add(u.dispositivo));
                actualizarSelectDispositivos();
            } catch (e) {}
        }
        
        function actualizarSelectDispositivos() {
            const select = document.getElementById('selectDispositivo');
            const actual = select.value;
            select.innerHTML = '<option value="">Seleccionar dispositivo...</option>';
            Array.from(dispositivos).sort().forEach(d => {
                const option = document.createElement('option');
                option.value = d;
                option.textContent = d;
                select.appendChild(option);
            });
            if (actual) {
                select.value = actual;
                cargarFechas(actual);
            }
        }
        
        document.getElementById('selectDispositivo').addEventListener('change', (e) => {
            if (e.target.value) cargarFechas(e.target.value);
        });
        
        async function cargarFechas(dispositivo) {
            try {
                const res = await fetch(\`/api/fechas/\${dispositivo}\`);
                const data = await res.json();
                const selectFecha = document.getElementById('selectFecha');
                if (data.fechas.length > 0) {
                    selectFecha.value = data.fechas[0];
                }
            } catch (e) {}
        }
        
        async function cargarHistorial() {
            const dispositivo = document.getElementById('selectDispositivo').value;
            const fecha = document.getElementById('selectFecha').value;
            if (!dispositivo || !fecha) {
                alert('Selecciona dispositivo y fecha');
                return;
            }
            try {
                const res = await fetch(\`/api/historial/\${dispositivo}?fecha=\${fecha}\`);
                const data = await res.json();
                historialActual = data.historial;
                mostrarTodo();
            } catch (e) {}
        }
        
        function mostrarTodo() {
            mostrarRuta(historialActual);
        }
        
        function mostrarUltimos30() {
            const hace30min = Date.now() - (30 * 60 * 1000);
            const filtrados = historialActual.filter(p => p.timestamp > hace30min);
            mostrarRuta(filtrados.length > 0 ? filtrados : historialActual);
        }
        
        function mostrarRuta(puntos) {
            Object.values(markers).forEach(m => map.removeLayer(m));
            Object.values(polylines).forEach(p => map.removeLayer(p));
            markers = {};
            polylines = {};
            
            if (puntos.length === 0) {
                document.getElementById('listadoPuntos').innerHTML = '<p style="color: #999;">No hay datos</p>';
                return;
            }
            
            const ruta = puntos.map(p => [p.lat, p.lng]);
            const polyline = L.polyline(ruta, {
                color: '#667eea',
                opacity: 0.8,
                weight: 3
            }).addTo(map);
            polylines['ruta'] = polyline;
            
            if (puntos.length > 0) {
                markers['inicio'] = L.marker([puntos[0].lat, puntos[0].lng], {
                    title: 'INICIO'
                }).bindPopup('<b>INICIO</b>').addTo(map);
                
                markers['fin'] = L.marker([puntos[puntos.length-1].lat, puntos[puntos.length-1].lng], {
                    title: 'FIN'
                }).bindPopup('<b>FIN</b>').addTo(map);
            }
            
            map.fitBounds(L.latLngBounds(ruta));
            
            actualizarEstadisticas(puntos);
            
            let html = '';
            puntos.forEach((p, i) => {
                html += \`<div class="punto" onclick="irAlPunto(\${p.lat}, \${p.lng})"><strong>#\${i+1}</strong> \${p.hora}</div>\`;
            });
            document.getElementById('listadoPuntos').innerHTML = html;
        }
        
        function irAlPunto(lat, lng) {
            map.setView([lat, lng], 18);
        }
        
        function actualizarEstadisticas(puntos) {
            document.getElementById('totalPuntos').textContent = puntos.length;
            if (puntos.length > 0) {
                document.getElementById('horaInicio').textContent = puntos[0].hora;
                document.getElementById('horaFin').textContent = puntos[puntos.length-1].hora;
                const duracion = puntos[puntos.length-1].timestamp - puntos[0].timestamp;
                const horas = Math.floor(duracion / 3600000);
                const minutos = Math.floor((duracion % 3600000) / 60000);
                document.getElementById('tiempoTotal').textContent = \`\${horas}h \${minutos}m\`;
                const distancia = calcularDistancia(puntos);
                document.getElementById('distancia').textContent = distancia.toFixed(2) + ' km';
            }
        }
        
        function calcularDistancia(puntos) {
            let total = 0;
            for (let i = 0; i < puntos.length - 1; i++) {
                total += distanciaEntre(puntos[i].lat, puntos[i].lng, puntos[i+1].lat, puntos[i+1].lng);
            }
            return total;
        }
        
        function distanciaEntre(lat1, lng1, lat2, lng2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                     Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }
        
        async function cargarActual() {
            try {
                const res = await fetch('/api/ubicaciones');
                const data = await res.json();
                Object.values(markers).forEach(m => map.removeLayer(m));
                Object.values(polylines).forEach(p => map.removeLayer(p));
                markers = {};
                polylines = {};
                
                data.ubicaciones.forEach(u => {
                    markers[u.dispositivo] = L.marker([u.lat, u.lng]).bindPopup('<b>' + u.dispositivo + '</b>').addTo(map);
                });
                
                if (data.ubicaciones.length > 0) {
                    map.setView([data.ubicaciones[0].lat, data.ubicaciones[0].lng], 14);
                }
            } catch (e) {}
        }
        
        window.addEventListener('DOMContentLoaded', () => {
            iniciarMapa();
            document.getElementById('selectFecha').valueAsDate = new Date();
            conectarWebSocket();
        });
    </script>
</body>
</html>
    `);
});

function broadcast() {
    const datos = JSON.stringify(Object.values(ubicacionesActuales));
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(datos);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n Servidor corriendo en puerto ${PORT}`);
    console.log(` Abre: http://localhost:${PORT}\n`);
});