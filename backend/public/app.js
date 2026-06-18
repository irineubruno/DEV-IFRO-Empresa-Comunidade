// Configurações do Supabase (Anon Key e URL Local fornecidos)
const SUPABASE_URL = "https://baas-trafegoalerta.bisn.com.br";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzgxNTk5MjA4LCJleHAiOjQ5MzUxOTkyMDh9.EhKoHMrwcwgOY9QYNi0ZP09GeeouHZKLrNk_62jy9-c";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Configurações do Backend Local
const BACKEND_URL = ""; // Usa rota relativa, adaptando-se magicamente a localhost ou produção

// Coordenadas corrigidas do município de Ariquemes (baseado nos shapefiles reais)
const ARIQUEMES_LAT = -9.978424;
const ARIQUEMES_LON = -63.020744;

// Estado da Aplicação
let map;
let roadLayersGroup;
let incidentMarkersGroup;
let hydroLayersGroup;
let incidentChart;
let simulatedRainValue = 5;
let currentTileLayer;

// Cores dos Status
const STATUS_COLORS = {
  livre: '#00d97e',    // Verde
  atencao: '#ffa000',  // Laranja
  bloqueado: '#ff3b30'  // Vermelho
};

// Cores de Status de Áreas
const AREA_STATUS_COLORS = {
  normal: '#00d97e',
  atencao: '#ffa000',
  critico: '#ff3b30',
  interditado: '#c084fc'
};

// Mapeamento de ícones e cores por tipo de incidente
const INCIDENT_ICONS = {
  atolamento:        { icon: 'car',             color: '#ff3b30', label: 'Atolamento de Veículo' },
  erosao:            { icon: 'mountain-snow',    color: '#ffa000', label: 'Erosão Severa' },
  bueiro_danificado: { icon: 'wrench',           color: '#a1a1aa', label: 'Bueiro Danificado' },
  ponte_caida:       { icon: 'construction',     color: '#ff0080', label: 'Ponte Danificada' },
  alagamento:        { icon: 'waves',            color: '#00b4d8', label: 'Alagamento' },
  buraco_severo:     { icon: 'circle-alert',     color: '#eab308', label: 'Buraco Severo' },
  queda_arvore:      { icon: 'tree-pine',        color: '#22c55e', label: 'Queda de Árvore' },
  deslizamento:      { icon: 'triangle-alert',   color: '#a16207', label: 'Deslizamento' },
  animal_na_pista:   { icon: 'bug',              color: '#a855f7', label: 'Animal na Pista' },
  obra_em_andamento: { icon: 'hard-hat',         color: '#f97316', label: 'Obra em Andamento' }
};

// Ícones de clima (WMO Weather Code -> Emoji)
const WEATHER_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  56: '🌨️', 57: '🌨️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  66: '🌨️', 67: '🌨️',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '❄️', 86: '❄️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
};

// Estado do usuário logado
let currentUser = null;
let currentUserProfile = null;

// Estado de áreas monitoradas
let areasLayersGroup;
let pendingPolygonLayer = null;

// ==========================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
  // Aplicar tema salvo
  initTheme();

  // Inicializar ícones do Lucide
  lucide.createIcons();

  // VERIFICAR AUTENTICAÇÃO
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  // Inicializar o Mapa
  initMap();

  // Inicializar Gráficos
  initChart();

  // Carregar dados iniciais
  await loadDashboardData();

  // Configurar Realtime
  setupRealtime();

  // Configurar Eventos da UI
  setupUIEvents();

  // Focar em coordenadas geográficas se fornecidas via Query String
  const urlParams = new URLSearchParams(window.location.search);
  const latParam = parseFloat(urlParams.get('lat'));
  const lngParam = parseFloat(urlParams.get('lng'));
  const zoomParam = parseInt(urlParams.get('zoom')) || 14;

  if (!isNaN(latParam) && !isNaN(lngParam)) {
    setTimeout(() => {
      if (map) {
        map.setView([latParam, lngParam], zoomParam);
        
        // Exibir um popup informativo no ponto focado
        L.popup()
          .setLatLng([latParam, lngParam])
          .setContent(`<strong>Visualizando Ocorrência</strong><br>Lat: ${latParam.toFixed(5)}<br>Lng: ${lngParam.toFixed(5)}`)
          .openOn(map);
      }
    }, 600);
  }
});

// ==========================================================================
// SISTEMA DE AUTENTICAÇÃO
// ==========================================================================
async function checkAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
      window.location.href = '/login';
      return false;
    }

    currentUser = session.user;
    
    // Buscar perfil do usuário
    const { data: perfil } = await supabaseClient
      .from('perfis')
      .select('nome, funcao, veiculo_tipo')
      .eq('id', currentUser.id)
      .single();

    currentUserProfile = perfil;
    displayUserInfo();
    return true;
  } catch (err) {
    console.error('Erro ao verificar autenticação:', err);
    window.location.href = '/login';
    return false;
  }
}

function displayUserInfo() {
  const nome = currentUserProfile?.nome || currentUser?.user_metadata?.nome || currentUser?.email || 'Usuário';
  const funcao = currentUserProfile?.funcao || currentUser?.user_metadata?.funcao || 'cidadao';

  const funcaoLabels = {
    administrador: 'Administrador',
    secretaria_obras: 'Secretaria de Obras',
    motorista: 'Motorista',
    produtor: 'Produtor Rural',
    cidadao: 'Cidadão'
  };

  document.getElementById('user-display-name').innerText = nome;
  document.getElementById('user-display-role').innerText = funcaoLabels[funcao] || funcao;
  document.getElementById('user-avatar').innerText = nome.charAt(0).toUpperCase();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = '/login';
}

// ==========================================================================
// SISTEMA DE TEMA CLARO / ESCURO
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('trafegoalert-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('trafegoalert-theme', newTheme);

  // Trocar tiles do mapa
  updateMapTiles(newTheme);

  // Re-renderizar ícones do Lucide
  lucide.createIcons();

  // Atualizar cores do Chart.js
  updateChartTheme();
}

function updateMapTiles(theme) {
  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
  }

  const tileUrl = theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  currentTileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
}

function updateChartTheme() {
  if (!incidentChart) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9ca3af' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';

  incidentChart.options.scales.x.ticks.color = textColor;
  incidentChart.options.scales.y.ticks.color = textColor;
  incidentChart.options.scales.y.grid.color = gridColor;
  incidentChart.update();
}

// ==========================================================================
// CONFIGURAÇÃO DO MAPA (LEAFLET)
// ==========================================================================
function initMap() {
  // Centralizado em Ariquemes/RO com coordenadas corretas dos shapefiles
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([ARIQUEMES_LAT, ARIQUEMES_LON], 11);

  // Adicionar controle de zoom no topo direito
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Tile layer baseado no tema atual
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const tileUrl = currentTheme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  currentTileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

  // Grupos de camadas para gerenciar facilidade de remoção/atualização
  roadLayersGroup = L.layerGroup().addTo(map);
  incidentMarkersGroup = L.layerGroup().addTo(map);
  hydroLayersGroup = L.layerGroup().addTo(map);
  areasLayersGroup = L.layerGroup().addTo(map);

  // Carregar camada de hidrografia do GeoJSON
  loadHydrography();
}

// Carregar hidrografia real de Ariquemes (GeoJSON extraído dos shapefiles)
async function loadHydrography() {
  try {
    const response = await fetch('/ariquemes_hidrografia.geojson');
    if (!response.ok) return;
    const geojson = await response.json();

    L.geoJSON(geojson, {
      style: {
        color: '#1e90ff',
        weight: 2,
        opacity: 0.5,
        dashArray: '5, 5'
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        if (props.HIDRO) {
          layer.bindTooltip(props.HIDRO, {
            permanent: false,
            direction: 'top',
            className: 'hydro-tooltip'
          });
        }
      }
    }).addTo(hydroLayersGroup);
  } catch (err) {
    console.log('GeoJSON de hidrografia não disponível:', err.message);
  }
}

// ==========================================================================
// CARREGAMENTO DE DADOS (SUPABASE API)
// ==========================================================================
async function loadDashboardData() {
  try {
    await Promise.all([
      loadLinhasRurais(),
      loadIncidentes(),
      loadWeatherData(),
      loadAreasMonitoradas()
    ]);
  } catch (err) {
    console.error('Erro ao carregar dados do painel:', err);
  }
}

// 1. Carregar Linhas Rurais (Estradas)
async function loadLinhasRurais() {
  const { data: linhas, error } = await supabaseClient
    .from('linhas_rurais')
    .select('id, nome, status_trafego, indice_risco, geom, jurisdicao, pavimentada');

  if (error) {
    console.error('Erro ao buscar linhas rurais:', error);
    return;
  }

  roadLayersGroup.clearLayers();

  let countLivre = 0;
  let countAtencao = 0;
  let countBloqueado = 0;

  linhas.forEach(linha => {
    // Incrementar contadores
    if (linha.status_trafego === 'livre') countLivre++;
    else if (linha.status_trafego === 'atencao') countAtencao++;
    else if (linha.status_trafego === 'bloqueado') countBloqueado++;

    if (linha.geom) {
      // PostGIS armazena LineString. Precisamos converter coordenadas GeoJSON (lon, lat) para Leaflet (lat, lon)
      const leafletCoords = linha.geom.coordinates.map(coord => [coord[1], coord[0]]);

      const polyline = L.polyline(leafletCoords, {
        color: STATUS_COLORS[linha.status_trafego] || '#ffffff',
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round'
      }).addTo(roadLayersGroup);

      // Guardar os dados brutos da linha rural na polyline para fins de filtragem
      polyline.linhaData = linha;

      // Efeito de hover brilhante
      polyline.on('mouseover', function(e) {
        this.setStyle({ weight: 9, opacity: 1 });
      });
      polyline.on('mouseout', function(e) {
        this.setStyle({ weight: 6, opacity: 0.85 });
      });

      // Clique para exibir painel flutuante
      polyline.on('click', () => {
        showRoadDetails(linha);
      });
    }
  });

  // Atualizar painel de estatísticas
  document.getElementById('stats-livre').innerText = countLivre;
  document.getElementById('stats-atencao').innerText = countAtencao;
  document.getElementById('stats-bloqueado').innerText = countBloqueado;
}

// Armazena a via selecionada para edição
let currentSelectedRoadId = null;

// Exibir painel flutuante com detalhes da estrada
function showRoadDetails(linha) {
  currentSelectedRoadId = linha.id;
  const card = document.getElementById('road-detail-card');
  document.getElementById('road-name').innerText = linha.nome;
  document.getElementById('road-risk').innerText = parseFloat(linha.indice_risco).toFixed(1);

  const statusEl = document.getElementById('road-status');
  statusEl.innerText = linha.status_trafego.toUpperCase();
  statusEl.style.color = STATUS_COLORS[linha.status_trafego];

  document.getElementById('road-jurisdiction').innerText = linha.jurisdicao || 'Municipal';
  document.getElementById('road-paved').innerText = linha.pavimentada ? 'Asfalto' : 'Terra';

  card.style.display = 'block';
}

// 2. Carregar Incidentes de Campo (Pontos Críticos)
async function loadIncidentes() {
  const { data: incidentes, error } = await supabaseClient
    .from('reportes_incidentes')
    .select('id, tipo_problema, descricao, latitude, longitude, resolvido, data_criacao_dispositivo')
    .order('data_criacao_dispositivo', { ascending: false });

  if (error) {
    console.error('Erro ao buscar incidentes:', error);
    return;
  }

  incidentMarkersGroup.clearLayers();
  const listContainer = document.getElementById('incident-list-container');
  listContainer.innerHTML = '';

  const activeIncidentes = incidentes.filter(inc => !inc.resolvido);

  if (activeIncidentes.length === 0) {
    listContainer.innerHTML = '<div class="no-incidents">Nenhum incidente ativo registrado.</div>';
  } else {
    activeIncidentes.forEach(inc => {
      // Obter configuração de ícone e cor para este tipo
      const iconConfig = INCIDENT_ICONS[inc.tipo_problema] || { icon: 'alert-triangle', color: '#ffa000', label: inc.tipo_problema };

      // Criar marcador SVG diferenciado
      const markerHtml = `
        <div class="incident-marker-icon" style="
          background-color: ${iconConfig.color};
          --marker-glow: ${iconConfig.color};
        ">
          <i data-lucide="${iconConfig.icon}"></i>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([inc.latitude, inc.longitude], { icon: customIcon })
        .addTo(incidentMarkersGroup);

      // Ao clicar, abrir card flutuante de detalhes
      marker.on('click', () => {
        showIncidentDetails(inc);
      });

      // Guardar dados brutos do incidente no marcador para filtragem
      marker.incidentData = inc;

      // Adicionar à lista lateral
      const dateStr = new Date(inc.data_criacao_dispositivo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const itemHtml = `
        <div class="incident-item" onclick="showIncidentDetails(${JSON.stringify(inc).replace(/"/g, '&quot;')})">
          <div class="incident-info">
            <span class="incident-title">${inc.descricao || iconConfig.label}</span>
            <span class="incident-meta">Às ${dateStr} • Lat: ${parseFloat(inc.latitude).toFixed(3)}</span>
          </div>
          <span class="incident-badge ${inc.tipo_problema}">${inc.tipo_problema.replace(/_/g, ' ')}</span>
        </div>
      `;
      listContainer.innerHTML += itemHtml;
    });
  }

  // Re-renderizar ícones Lucide dentro dos marcadores
  setTimeout(() => lucide.createIcons(), 100);
}

// Exibir card flutuante com detalhes do incidente
function showIncidentDetails(inc) {
  const card = document.getElementById('incident-detail-card');
  const iconConfig = INCIDENT_ICONS[inc.tipo_problema] || { icon: 'alert-triangle', color: '#ffa000', label: inc.tipo_problema };

  // Ícone do tipo
  const iconEl = document.getElementById('incident-detail-icon');
  iconEl.style.background = iconConfig.color;
  iconEl.innerHTML = `<i data-lucide="${iconConfig.icon}"></i>`;

  // Título e data
  document.getElementById('incident-detail-type').innerText = iconConfig.label;
  document.getElementById('incident-detail-date').innerText = 
    new Date(inc.data_criacao_dispositivo).toLocaleString('pt-BR', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });

  // Descrição
  document.getElementById('incident-detail-desc').innerText = inc.descricao || 'Sem descrição detalhada.';

  // Coordenadas
  document.getElementById('incident-detail-lat').innerText = parseFloat(inc.latitude).toFixed(6);
  document.getElementById('incident-detail-lng').innerText = parseFloat(inc.longitude).toFixed(6);

  // Status
  const statusBox = document.getElementById('incident-detail-status-box');
  const statusText = document.getElementById('incident-detail-status');
  if (inc.resolvido) {
    statusBox.className = 'incident-detail-status resolved';
    statusText.innerText = 'Resolvido';
  } else {
    statusBox.className = 'incident-detail-status active';
    statusText.innerText = 'Ativo — Não Resolvido';
  }

  // Botão resolver (visível apenas se não resolvido)
  const btnResolve = document.getElementById('btn-resolve-incident');
  if (!inc.resolvido) {
    btnResolve.style.display = 'flex';
    btnResolve.onclick = async () => {
      await resolverIncidente(inc.id);
      card.style.display = 'none';
    };
  } else {
    btnResolve.style.display = 'none';
  }

  card.style.display = 'block';
  lucide.createIcons();

  // Centralizar mapa no incidente
  map.setView([inc.latitude, inc.longitude], 14);
}

// ==========================================================================
// INTEGRAÇÃO OPEN-METEO — DADOS METEOROLÓGICOS DETALHADOS
// ==========================================================================
async function loadWeatherData() {
  try {
    // Dados atuais + horários + diários da API Open-Meteo (gratuita, sem chave)
    const params = [
      `latitude=${ARIQUEMES_LAT}`,
      `longitude=${ARIQUEMES_LON}`,
      `current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,visibility`,
      `hourly=temperature_2m,precipitation_probability,weather_code`,
      `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max`,
      `timezone=America/Porto_Velho`,
      `forecast_days=7`
    ].join('&');

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    renderWeatherData(data);
  } catch (err) {
    console.error('Erro ao carregar dados climáticos Open-Meteo:', err);
    document.getElementById('climate-alert-text').innerText =
      'Sem conexão com API de clima. Usando simulação local.';
    updateClimateUI(simulatedRainValue);
  }
}

function renderWeatherData(data) {
  // === DADOS ATUAIS ===
  const current = data.current;
  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const feelsLike = current.apparent_temperature;
  const weatherCode = current.weather_code;
  const windSpeed = current.wind_speed_10m;
  const pressure = current.surface_pressure;
  const visibility = current.visibility;

  // Atualizar Hero do Clima
  document.getElementById('temp-val').innerText = Math.round(temp);
  document.getElementById('weather-icon').innerText = WEATHER_ICONS[weatherCode] || '🌤️';

  // Grid de detalhes
  document.getElementById('wind-val').innerText = `${windSpeed.toFixed(1)} km/h`;
  document.getElementById('humidity-val').innerText = `${humidity}%`;
  document.getElementById('pressure-val').innerText = `${Math.round(pressure)} hPa`;
  document.getElementById('visibility-val').innerText = visibility >= 1000
    ? `${(visibility / 1000).toFixed(1)} km`
    : `${visibility} m`;
  document.getElementById('feelslike-val').innerText = `${Math.round(feelsLike)}°C`;

  // === DADOS DIÁRIOS ===
  const daily = data.daily;
  const todayPrecip = daily.precipitation_sum[0];
  const uvMax = daily.uv_index_max[0];

  document.getElementById('precip-val').innerText = `${todayPrecip.toFixed(1)} mm`;
  document.getElementById('uv-val').innerText = uvMax.toFixed(1);

  // Barra de precipitação
  const percent = Math.min(100, (todayPrecip / 30) * 100);
  document.getElementById('precip-bar').style.width = `${percent}%`;

  // Alerta climático
  updateClimateAlert(todayPrecip);

  // Atualizar o slider para refletir a chuva real
  simulatedRainValue = todayPrecip;
  document.getElementById('rain-slider').value = Math.min(30, todayPrecip);
  document.getElementById('slider-val').innerText = `${todayPrecip.toFixed(1)} mm`;

  // === PREVISÃO POR HORA (próximas 12h) ===
  renderHourlyForecast(data.hourly);

  // === PREVISÃO 7 DIAS ===
  renderDailyForecast(daily);
}

function renderHourlyForecast(hourly) {
  const container = document.getElementById('hourly-forecast');
  container.innerHTML = '';

  // Encontrar o índice da hora atual
  const now = new Date();
  const currentHour = now.getHours();
  let startIdx = 0;

  for (let i = 0; i < hourly.time.length; i++) {
    const h = new Date(hourly.time[i]);
    if (h.getDate() === now.getDate() && h.getHours() >= currentHour) {
      startIdx = i;
      break;
    }
  }

  // Exibir próximas 12 horas
  for (let i = startIdx; i < Math.min(startIdx + 12, hourly.time.length); i++) {
    const time = new Date(hourly.time[i]);
    const hour = time.getHours().toString().padStart(2, '0') + 'h';
    const temp = Math.round(hourly.temperature_2m[i]);
    const precipProb = hourly.precipitation_probability[i];
    const code = hourly.weather_code[i];
    const icon = WEATHER_ICONS[code] || '🌤️';

    const item = document.createElement('div');
    item.className = 'hourly-item';
    item.innerHTML = `
      <span class="hourly-time">${hour}</span>
      <span class="hourly-icon">${icon}</span>
      <span class="hourly-temp">${temp}°</span>
      <span class="hourly-precip">${precipProb}%</span>
    `;
    container.appendChild(item);
  }
}

function renderDailyForecast(daily) {
  const container = document.getElementById('forecast-list');
  container.innerHTML = '';

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let i = 0; i < daily.time.length; i++) {
    const date = new Date(daily.time[i] + 'T12:00:00');
    const dayName = i === 0 ? 'Hoje' : dayNames[date.getDay()];
    const icon = WEATHER_ICONS[daily.weather_code[i]] || '🌤️';
    const maxTemp = Math.round(daily.temperature_2m_max[i]);
    const minTemp = Math.round(daily.temperature_2m_min[i]);
    const rain = daily.precipitation_sum[i];

    const dayEl = document.createElement('div');
    dayEl.className = 'forecast-day';
    dayEl.innerHTML = `
      <span class="forecast-day-name">${dayName}</span>
      <span class="forecast-day-icon">${icon}</span>
      <div class="forecast-day-temps">
        <span class="forecast-max">${maxTemp}°</span>
        <span class="forecast-min">${minTemp}°</span>
      </div>
      <span class="forecast-rain">${rain.toFixed(1)} mm</span>
    `;
    container.appendChild(dayEl);
  }
}

function updateClimateAlert(rainMm) {
  const alertBox = document.getElementById('climate-alert-box');
  const alertText = document.getElementById('climate-alert-text');

  if (rainMm >= 15) {
    alertBox.className = 'climate-warning alert-high';
    alertText.innerText = 'ALERTA: Chuva forte prevista! Alta vulnerabilidade e risco de colapso nas linhas rurais.';
  } else if (rainMm >= 7) {
    alertBox.className = 'climate-warning';
    alertText.innerText = 'Atenção: Chuva moderada. Atenção especial a trechos com buracos históricos.';
  } else {
    alertBox.className = 'climate-warning';
    alertText.innerText = 'Clima ameno. Risco logístico normal para tráfego pesado.';
  }
}

function updateClimateUI(rainMm) {
  const precipValEl = document.getElementById('precip-val');
  const precipBarEl = document.getElementById('precip-bar');

  precipValEl.innerText = `${rainMm.toFixed(1)} mm`;
  const percent = Math.min(100, (rainMm / 30) * 100);
  precipBarEl.style.width = `${percent}%`;

  updateClimateAlert(rainMm);
}

// ==========================================================================
// CONFIGURAÇÃO DO REALTIME (WEBSOCKETS SUPABASE)
// ==========================================================================
function setupRealtime() {
  supabaseClient
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes_incidentes' }, payload => {
       console.log('Realtime: Incidente alterado', payload);
       loadIncidentes();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'linhas_rurais' }, payload => {
       console.log('Realtime: Linha rural alterada', payload);
       loadLinhasRurais();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'areas_monitoradas' }, payload => {
       console.log('Realtime: Área monitorada alterada', payload);
       loadAreasMonitoradas();
    })
    .subscribe();
}

// ==========================================================================
// CONFIGURAÇÃO DE EVENTOS DA UI
// ==========================================================================
function setupUIEvents() {
  // Toggle de Tema
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

  // Logout
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Fechar card de detalhes do incidente
  document.getElementById('btn-close-incident').addEventListener('click', () => {
    document.getElementById('incident-detail-card').style.display = 'none';
  });

  // Modal do Polígono
  setupPolygonModal();

  // Slider de Simulação de Chuva
  const slider = document.getElementById('rain-slider');
  const sliderVal = document.getElementById('slider-val');

  slider.addEventListener('input', (e) => {
    simulatedRainValue = parseFloat(e.target.value);
    sliderVal.innerText = `${simulatedRainValue} mm`;
    updateClimateUI(simulatedRainValue);
  });

  // Botão Recalcular Risco
  const btnRecalcular = document.getElementById('btn-recalculate');
  btnRecalcular.addEventListener('click', async () => {
    btnRecalcular.disabled = true;
    btnRecalcular.innerHTML = '<i data-lucide="loader" class="spin"></i> Calculando...';
    lucide.createIcons();

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rainMm: simulatedRainValue })
      });

      if (response.ok) {
        console.log('Recálculo disparado com sucesso');
      } else {
        alert('Erro ao recalcular riscos no backend');
      }
    } catch (err) {
      console.error(err);
      // Caso o backend não esteja ativo, simula localmente no mapa
      alert('Backend offline. Simulando recálculo local de testes...');
      mockRecalcularLocal();
    } finally {
      setTimeout(() => {
        btnRecalcular.disabled = false;
        btnRecalcular.innerHTML = '<i data-lucide="play-circle"></i> Recalcular Risco';
        lucide.createIcons();
      }, 800);
    }
  });

  // Form de Incidente Manual
  const form = document.getElementById('form-reporte');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const tipo = document.getElementById('rep-tipo').value;
    const lat = parseFloat(document.getElementById('rep-lat').value);
    const lng = parseFloat(document.getElementById('rep-lng').value);
    const desc = document.getElementById('rep-desc').value;

    const novoIncidente = {
      tipo_problema: tipo,
      descricao: desc,
      latitude: lat,
      longitude: lng,
      resolvido: false,
      data_criacao_dispositivo: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from('reportes_incidentes')
      .insert([novoIncidente]);

    if (error) {
      alert('Erro ao salvar incidente no Supabase: ' + error.message);
    } else {
      form.reset();
      loadIncidentes();
    }
  });

  // Fechar card flutuante de estrada
  document.getElementById('btn-close-road').addEventListener('click', () => {
    document.getElementById('road-detail-card').style.display = 'none';
    currentSelectedRoadId = null;
  });

  // Botões de alterar status da via (Web)
  document.querySelectorAll('.btn-change-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!currentSelectedRoadId) return;
      const novoStatus = e.target.getAttribute('data-status');
      
      const { error } = await supabaseClient
        .from('linhas_rurais')
        .update({ status_trafego: novoStatus })
        .eq('id', currentSelectedRoadId);
        
      if (error) {
        alert('Erro ao atualizar status: ' + error.message);
      } else {
        // Fechar o card ou apenas atualizar a cor visualmente. O Realtime já recarregará a camada do mapa.
        document.getElementById('road-status').innerText = novoStatus.toUpperCase();
        document.getElementById('road-status').style.color = STATUS_COLORS[novoStatus];
      }
    });
  });

  // Clique no mapa preenche Lat/Lng no form e exibe popup informativo
  map.on('click', (e) => {
    if (routingModeActive || drawingModeActive) return;
    
    document.getElementById('rep-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('rep-lng').value = e.latlng.lng.toFixed(6);
    
    // Abrir popup explicativo no local do clique
    L.popup()
      .setLatLng(e.latlng)
      .setContent(createPointPopupHtml('Ponto Selecionado', e.latlng))
      .openOn(map);
  });

  // Controles de camadas do mapa
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const layer = btn.dataset.layer;

      if (layer === 'roads') {
        if (btn.classList.contains('active')) {
          roadLayersGroup.addTo(map);
        } else {
          map.removeLayer(roadLayersGroup);
        }
      } else if (layer === 'hydro') {
        if (btn.classList.contains('active')) {
          hydroLayersGroup.addTo(map);
        } else {
          map.removeLayer(hydroLayersGroup);
        }
      } else if (layer === 'incidents') {
        if (btn.classList.contains('active')) {
          incidentMarkersGroup.addTo(map);
        } else {
          map.removeLayer(incidentMarkersGroup);
        }
      }
    });
  });

  // Inicializar pesquisa e ferramentas adicionais (Desenho e Rotas)
  initMapSearchAndRouting();
}

// Resolver um incidente ativo
async function resolverIncidente(id) {
  const { error } = await supabaseClient
    .from('reportes_incidentes')
    .update({ resolvido: true })
    .eq('id', id);

  if (error) {
    alert('Erro ao resolver incidente: ' + error.message);
  } else {
    loadIncidentes();
  }
}

// Simulador local para modo offline (caso backend esteja sendo configurado)
function mockRecalcularLocal() {
  // Apenas simula alteração das vias para demonstração visual
  loadLinhasRurais();
}

// ==========================================================================
// CONFIGURAÇÃO DOS GRÁFICOS (CHART.JS)
// ==========================================================================
function initChart() {
  const ctx = document.getElementById('incident-chart').getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9ca3af' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';

  // Design Premium de Gráfico em Linha
  incidentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
      datasets: [{
        label: 'Bloqueios Registrados',
        data: [12, 19, 28, 15, 8, 3],
        borderColor: '#00b4d8',
        borderWidth: 3,
        backgroundColor: 'rgba(0, 180, 216, 0.08)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#00b4d8',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Formatação auxiliar
function formatTipoProblema(tipo) {
  const config = INCIDENT_ICONS[tipo];
  return config ? config.label : tipo;
}

// ==========================================================================
// SISTEMA DE ÁREAS MONITORADAS (POLÍGONOS)
// ==========================================================================

async function loadAreasMonitoradas() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/areas`);
    if (!response.ok) return;
    const { areas } = await response.json();

    areasLayersGroup.clearLayers();
    const listContainer = document.getElementById('areas-list-container');
    listContainer.innerHTML = '';

    if (!areas || areas.length === 0) {
      listContainer.innerHTML = '<div class="no-incidents">Nenhuma área monitorada registrada.</div>';
      return;
    }

    areas.forEach(area => {
      const statusColor = AREA_STATUS_COLORS[area.status_situacao] || '#ffffff';

      if (area.geom && area.geom.coordinates) {
        // Converter GeoJSON Polygon para Leaflet (lat, lng)
        const leafletCoords = area.geom.coordinates[0].map(coord => [coord[1], coord[0]]);

        const polygon = L.polygon(leafletCoords, {
          color: statusColor,
          fillColor: statusColor,
          fillOpacity: 0.12,
          weight: 2,
          opacity: 0.7,
          dashArray: '6, 4'
        }).addTo(areasLayersGroup);

        polygon.bindTooltip(area.nome, {
          permanent: false,
          direction: 'center',
          className: 'area-tooltip'
        });

        polygon.on('click', () => {
          map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
        });
      }

      // Adicionar à lista lateral
      const statusLabels = { normal: 'Normal', atencao: 'Atenção', critico: 'Crítico', interditado: 'Interditado' };
      const itemHtml = `
        <div class="area-item">
          <div class="area-item-info">
            <span class="area-item-name">${area.nome}</span>
            <span class="area-item-desc">${area.descricao || 'Sem descrição'}</span>
          </div>
          <span class="area-status-badge ${area.status_situacao}">${statusLabels[area.status_situacao] || area.status_situacao}</span>
        </div>
      `;
      listContainer.innerHTML += itemHtml;
    });
  } catch (err) {
    console.log('Áreas monitoradas não disponíveis:', err.message);
  }
}

function setupPolygonModal() {
  const modal = document.getElementById('modal-polygon');
  const closeBtn = document.getElementById('btn-close-polygon-modal');
  const form = document.getElementById('form-polygon');

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    // Remover polígono pendente se o modal for fechado sem salvar
    if (pendingPolygonLayer) {
      map.removeLayer(pendingPolygonLayer);
      pendingPolygonLayer = null;
    }
  });

  // Click no overlay fecha
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeBtn.click();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!pendingPolygonLayer) {
      alert('Nenhum polígono desenhado.');
      return;
    }

    const nome = document.getElementById('poly-nome').value.trim();
    const descricao = document.getElementById('poly-desc').value.trim();
    const status = document.getElementById('poly-status').value;

    // Extrair coordenadas do polígono em [lng, lat]
    let latlngs = pendingPolygonLayer.getLatLngs();
    if (Array.isArray(latlngs[0])) latlngs = latlngs[0];
    const coordinates = latlngs.map(ll => [ll.lng, ll.lat]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao, status_situacao: status, coordinates })
      });

      if (response.ok) {
        modal.style.display = 'none';
        form.reset();
        // Remover polígono temporário (será recarregado do banco)
        if (pendingPolygonLayer) {
          map.removeLayer(pendingPolygonLayer);
          pendingPolygonLayer = null;
        }
        loadAreasMonitoradas();
      } else {
        const err = await response.json();
        alert('Erro ao salvar área: ' + (err.error || 'Erro desconhecido'));
      }
    } catch (err) {
      alert('Erro de conexão ao salvar área.');
    }
  });
}

// ==========================================================================
// FUNCIONALIDADES DE BUSCA, DESENHO E ROTAS (OSRM + NOMINATIM + GEOMAN)
// ==========================================================================
let searchMarker = null;
let currentDrawnLayer = null;
let routeStartLatLng = null;
let routeEndLatLng = null;
let routeStartMarker = null;
let routeEndMarker = null;
let routePolylineLayer = null;
let drawingModeActive = false;
let routingModeActive = false;

function initMapSearchAndRouting() {
  // --- BUSCA DE ENDEREÇOS ---
  const searchInput = document.getElementById('input-search-address');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  const dropdown = document.getElementById('search-results-dropdown');
  
  let debounceTimeout = null;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    if (query.length > 0) {
      clearSearchBtn.style.display = 'flex';
    } else {
      clearSearchBtn.style.display = 'none';
      dropdown.style.display = 'none';
      return;
    }
    
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      if (query.length >= 3) {
        fetchAddressResults(query);
      }
    }, 400);
  });
  
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    dropdown.style.display = 'none';
    if (searchMarker) {
      map.removeLayer(searchMarker);
      searchMarker = null;
    }
  });
  
  document.addEventListener('click', (e) => {
    const container = document.getElementById('search-bar-container');
    if (container && !container.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // --- BOTÕES DE FERRAMENTAS ---
  const drawBtn = document.getElementById('btn-tool-draw');
  const routeBtn = document.getElementById('btn-tool-route');
  const clearBtn = document.getElementById('btn-tool-clear');
  
  drawBtn.addEventListener('click', () => {
    toggleDrawingMode();
  });
  
  routeBtn.addEventListener('click', () => {
    toggleRoutingMode();
  });
  
  clearBtn.addEventListener('click', () => {
    clearDrawingsAndRoutes();
  });
  
  document.getElementById('btn-cancel-toast').addEventListener('click', () => {
    clearDrawingsAndRoutes();
  });
  
  // Listener do clique no mapa para rotas
  map.on('click', (e) => {
    if (routingModeActive) {
      handleRouteClick(e.latlng);
    }
  });

  // Habilitar escuta do Geoman para desenhos finalizados
  map.on('pm:create', (e) => {
    if (currentDrawnLayer) {
      map.removeLayer(currentDrawnLayer);
    }
    currentDrawnLayer = e.layer;
    
    // Desativar modo de desenho após finalizar
    deactivateDrawingMode();
    
    // Guardar referência para salvar
    pendingPolygonLayer = e.layer;
    
    // Abrir modal para salvar o polígono
    document.getElementById('modal-polygon').style.display = 'flex';
    lucide.createIcons();
    
    // Habilitar botão de limpar
    document.getElementById('btn-tool-clear').style.display = 'block';
  });
}

// 1. Busca via Nominatim
async function fetchAddressResults(query) {
  const dropdown = document.getElementById('search-results-dropdown');
  dropdown.innerHTML = '<div style="padding: 8px 12px; font-size: 0.8rem; color: var(--text-muted);"><i data-lucide="loader" class="spin" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Buscando...</div>';
  dropdown.style.display = 'block';
  lucide.createIcons();
  
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", Ariquemes, Rondônia, Brasil")}&limit=5`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'pt-BR'
      }
    });
    
    if (!response.ok) throw new Error("Erro na busca");
    const results = await response.json();
    
    const ariquemesResults = results.filter(r => {
      const nameLower = r.display_name.toLowerCase();
      return nameLower.includes('ariquemes') || nameLower.includes('rondonia') || nameLower.includes('rondônia');
    });
    
    const finalResults = ariquemesResults.length > 0 ? ariquemesResults : results;
    
    if (finalResults.length === 0) {
      dropdown.innerHTML = '<div style="padding: 8px 12px; font-size: 0.8rem; color: var(--text-muted);">Nenhum endereço encontrado.</div>';
      return;
    }
    
    dropdown.innerHTML = '';
    finalResults.forEach(item => {
      const cleanName = item.display_name
        .split(', ')
        .slice(0, 3)
        .join(', ');
        
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerText = cleanName;
      div.addEventListener('click', () => {
        selectAddress(item);
      });
      dropdown.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    dropdown.innerHTML = '<div style="padding: 8px 12px; font-size: 0.8rem; color: var(--text-danger);">Erro ao buscar endereços.</div>';
  }
}

function selectAddress(item) {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  
  document.getElementById('input-search-address').value = item.display_name.split(', ')[0];
  document.getElementById('search-results-dropdown').style.display = 'none';
  
  map.setView([lat, lon], 15);
  
  if (searchMarker) {
    map.removeLayer(searchMarker);
  }
  
  const searchIcon = L.divIcon({
    html: `
      <div style="
        background-color: var(--color-accent);
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 12px var(--color-accent);
      "></div>
    `,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  
  searchMarker = L.marker([lat, lon], { icon: searchIcon })
    .bindPopup(`<strong style="color: var(--text-heading); font-size: 0.85rem;">Localização Encontrada</strong><br><p style="margin: 4px 0 0; color: var(--text-muted); font-size: 0.75rem;">${item.display_name.split(', ').slice(0, 3).join(', ')}</p>`)
    .addTo(map)
    .openPopup();
}

// 2. Modos de Desenho
function toggleDrawingMode() {
  const drawBtn = document.getElementById('btn-tool-draw');
  
  if (drawingModeActive) {
    deactivateDrawingMode();
  } else {
    deactivateRoutingMode();
    clearDrawingsAndRoutes();
    
    drawingModeActive = true;
    drawBtn.classList.add('active');
    
    map.pm.enableDraw('Polygon', {
      snappable: true,
      allowSelfIntersection: false,
      templineStyle: { color: 'var(--color-accent)', weight: 3 },
      hintlineStyle: { color: 'var(--color-accent)', weight: 3, dashArray: '5, 5' },
      pathOptions: { color: 'var(--color-accent)', fillColor: 'var(--color-accent)', fillOpacity: 0.1 }
    });
    
    showMapToast('Clique no mapa para desenhar a área de busca (feche o polígono para pesquisar)...');
  }
}

function deactivateDrawingMode() {
  drawingModeActive = false;
  const drawBtn = document.getElementById('btn-tool-draw');
  if (drawBtn) drawBtn.classList.remove('active');
  map.pm.disableDraw();
}

function isPointInPolygon(point, polygon) {
  const x = point.lng, y = point.lat;
  let latlngs = polygon.getLatLngs();
  
  if (Array.isArray(latlngs[0])) {
    latlngs = latlngs[0];
  }
  
  let inside = false;
  for (let i = 0, j = latlngs.length - 1; i < latlngs.length; j = i++) {
    const xi = latlngs[i].lng, yi = latlngs[i].lat;
    const xj = latlngs[j].lng, yj = latlngs[j].lat;
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function filterElementsInsidePolygon(polygon) {
  let matchedIncidentCount = 0;
  let matchedRoadCount = 0;
  
  incidentMarkersGroup.eachLayer(marker => {
    const latlng = marker.getLatLng();
    const isInside = isPointInPolygon(latlng, polygon);
    
    if (isInside) {
      matchedIncidentCount++;
      if (marker.getElement()) {
        marker.getElement().style.opacity = '1.0';
      }
    } else {
      if (marker.getElement()) {
        marker.getElement().style.opacity = '0.2';
      }
    }
  });
  
  roadLayersGroup.eachLayer(layer => {
    if (layer instanceof L.Polyline) {
      const latlngs = layer.getLatLngs();
      let hasInsidePoint = false;
      
      for (let i = 0; i < latlngs.length; i++) {
        if (isPointInPolygon(latlngs[i], polygon)) {
          hasInsidePoint = true;
          break;
        }
      }
      
      if (hasInsidePoint) {
        matchedRoadCount++;
        layer.setStyle({ opacity: 0.85, weight: 6 });
      } else {
        layer.setStyle({ opacity: 0.15, weight: 3 });
      }
    }
  });
  
  showMapToast(`Filtro por desenho ativo: ${matchedIncidentCount} incidente(s) e ${matchedRoadCount} estrada(s) na área.`);
}

// 3. Modos de Rotas
function toggleRoutingMode() {
  const routeBtn = document.getElementById('btn-tool-route');
  
  if (routingModeActive) {
    deactivateRoutingMode();
  } else {
    deactivateDrawingMode();
    clearDrawingsAndRoutes();
    
    routingModeActive = true;
    routeBtn.classList.add('active');
    
    showMapToast('Selecione o ponto de partida (Origem) clicando no mapa...');
  }
}

function deactivateRoutingMode() {
  routingModeActive = false;
  const routeBtn = document.getElementById('btn-tool-route');
  if (routeBtn) routeBtn.classList.remove('active');
  hideMapToast();
}

async function handleRouteClick(latlng) {
  if (!routeStartLatLng) {
    routeStartLatLng = latlng;
    
    const startIcon = L.divIcon({
      html: `
        <div style="
          background-color: var(--color-success);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px var(--color-success);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #000;
          font-size: 10px;
          font-weight: 800;
        ">A</div>
      `,
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    
    routeStartMarker = L.marker(latlng, { icon: startIcon })
      .bindPopup(createPointPopupHtml('Ponto A (Origem)', latlng))
      .addTo(map);
      
    showMapToast('Selecione o ponto de chegada (Destino) clicando no mapa...');
    document.getElementById('btn-tool-clear').style.display = 'block';
  } else if (!routeEndLatLng) {
    routeEndLatLng = latlng;
    
    const endIcon = L.divIcon({
      html: `
        <div style="
          background-color: var(--color-danger);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px var(--color-danger);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
        ">B</div>
      `,
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    
    routeEndMarker = L.marker(latlng, { icon: endIcon })
      .bindPopup(createPointPopupHtml('Ponto B (Destino)', latlng))
      .addTo(map);
      
    showMapToast('Calculando rota ideal via OSRM...');
    
    await calculateRoute();
  }
}

async function calculateRoute() {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${routeStartLatLng.lng},${routeStartLatLng.lat};${routeEndLatLng.lng},${routeEndLatLng.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Erro ao traçar rota");
    
    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      showMapToast('Nenhuma rota encontrada para os pontos selecionados.');
      return;
    }
    
    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    
    if (routePolylineLayer) {
      map.removeLayer(routePolylineLayer);
    }
    
    routePolylineLayer = L.polyline(coords, {
      color: 'var(--color-accent)',
      weight: 8,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(map);
    
    map.fitBounds(routePolylineLayer.getBounds(), { padding: [50, 50] });
    
    // Verificar se a rota cruza incidentes graves (alagamentos, atolamentos ou pontes caídas ativos)
    let isBlocked = false;
    let blockageCount = 0;
    
    incidentMarkersGroup.eachLayer(marker => {
      const inc = marker.incidentData;
      if (inc && !inc.resolvido && (inc.tipo_problema === 'atolamento' || inc.tipo_problema === 'ponte_caida' || inc.tipo_problema === 'alagamento')) {
        const markerLatLng = marker.getLatLng();
        
        for (let i = 0; i < coords.length; i++) {
          const dist = map.distance(coords[i], [markerLatLng.lat, markerLatLng.lng]);
          if (dist <= 150) { // Dentro de 150 metros da rota
            isBlocked = true;
            blockageCount++;
            break;
          }
        }
      }
    });
    
    let timeStr = durationMin >= 60 
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}min` 
      : `${durationMin} min`;
      
    if (isBlocked) {
      showMapToast(`Rota: ${distanceKm} km (${timeStr}). ⚠️ ATENÇÃO: Contém ${blockageCount} ponto(s) de bloqueio no caminho!`, true);
    } else {
      showMapToast(`Rota: ${distanceKm} km (${timeStr}). 🟢 Tráfego livre no trecho selecionado.`);
    }
    
    // Identificar e listar trechos (linhas rurais) cruzados
    const roadsTraversed = getRoadsAlongRoute(coords);
    const stretchesList = document.getElementById('route-stretches-list');
    
    if (roadsTraversed.length > 0) {
      stretchesList.innerHTML = '<strong style="display: block; font-size: 0.75rem; color: var(--text-heading); margin-bottom: 4px;">Trechos Percorridos:</strong>';
      roadsTraversed.forEach(road => {
        const statusColor = STATUS_COLORS[road.status_trafego] || '#ffffff';
        const pavText = road.pavimentada ? 'Asfalto' : 'Terra';
        stretchesList.innerHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span style="color: var(--text-muted); font-size: 0.72rem;">${road.nome} (${pavText})</span>
            <span style="color: ${statusColor}; font-weight: 700; font-size: 0.72rem; text-transform: uppercase;">${road.status_trafego}</span>
          </div>
        `;
      });
      stretchesList.style.display = 'flex';
    } else {
      stretchesList.style.display = 'none';
    }
    
  } catch (err) {
    console.error(err);
    showMapToast('Erro ao calcular a rota de tráfego.');
  }
}

// 4. Limpeza e Toast de Feedback
function clearDrawingsAndRoutes() {
  if (currentDrawnLayer) {
    map.removeLayer(currentDrawnLayer);
    currentDrawnLayer = null;
  }
  
  if (routePolylineLayer) {
    map.removeLayer(routePolylineLayer);
    routePolylineLayer = null;
  }
  
  if (routeStartMarker) {
    map.removeLayer(routeStartMarker);
    routeStartMarker = null;
  }
  
  if (routeEndMarker) {
    map.removeLayer(routeEndMarker);
    routeEndMarker = null;
  }
  
  routeStartLatLng = null;
  routeEndLatLng = null;
  
  // Restaurar opacidades
  incidentMarkersGroup.eachLayer(marker => {
    if (marker.getElement()) {
      marker.getElement().style.opacity = '1.0';
    }
  });
  
  roadLayersGroup.eachLayer(layer => {
    if (layer instanceof L.Polyline) {
      layer.setStyle({ opacity: 0.85, weight: 6 });
    }
  });
  
  document.getElementById('btn-tool-clear').style.display = 'none';
  
  const stretchesList = document.getElementById('route-stretches-list');
  if (stretchesList) {
    stretchesList.innerHTML = '';
    stretchesList.style.display = 'none';
  }
  
  hideMapToast();
  deactivateDrawingMode();
  deactivateRoutingMode();
}

function showMapToast(text, isDanger = false) {
  const toast = document.getElementById('map-info-toast');
  const toastText = document.getElementById('toast-text');
  
  toastText.innerText = text;
  if (isDanger) {
    toastText.style.color = 'var(--color-danger)';
    toastText.style.fontWeight = '700';
  } else {
    toastText.style.color = 'var(--text-main)';
    toastText.style.fontWeight = '500';
  }
  
  toast.style.display = 'flex';
}

function hideMapToast() {
  document.getElementById('map-info-toast').style.display = 'none';
}

// ==========================================================================
// FUNÇÕES AUXILIARES DE ANÁLISE GEOGRÁFICA
// ==========================================================================

// Encontra a estrada rural (linha) mais próxima do ponto clicado
function findNearestRoad(latlng) {
  let nearestRoad = null;
  let minDistance = Infinity;
  
  roadLayersGroup.eachLayer(layer => {
    if (layer instanceof L.Polyline) {
      const latlngs = layer.getLatLngs();
      for (let i = 0; i < latlngs.length; i++) {
        const dist = map.distance(latlng, latlngs[i]);
        if (dist < minDistance) {
          minDistance = dist;
          nearestRoad = layer.linhaData;
        }
      }
    }
  });
  
  return { road: nearestRoad, distance: minDistance };
}

// Retorna todas as estradas vicinais cruzadas ou que correm ao longo da rota
function getRoadsAlongRoute(routeCoords) {
  const traversedRoads = new Set();
  const roadList = [];
  
  roadLayersGroup.eachLayer(layer => {
    const road = layer.linhaData;
    if (road && !traversedRoads.has(road.id)) {
      const roadLatLngs = layer.getLatLngs();
      
      let isNear = false;
      for (let i = 0; i < routeCoords.length; i += 3) {
        for (let j = 0; j < roadLatLngs.length; j += 2) {
          const dist = map.distance(routeCoords[i], roadLatLngs[j]);
          if (dist <= 150) { // Dentro de 150 metros da linha
            isNear = true;
            break;
          }
        }
        if (isNear) break;
      }
      
      if (isNear) {
        traversedRoads.add(road.id);
        roadList.push(road);
      }
    }
  });
  
  return roadList;
}

// Gera o conteúdo HTML do popup para pontos mapeados (origem, destino, clique no mapa)
function createPointPopupHtml(label, latlng) {
  const nearest = findNearestRoad(latlng);
  let roadInfoHtml = `<p style="margin: 4px 0; font-size: 0.72rem; color: var(--text-muted);">Nenhuma via rural mapeada por perto.</p>`;
  
  if (nearest.road && nearest.distance <= 400) {
    const distText = nearest.distance < 1000 ? `${Math.round(nearest.distance)}m` : `${(nearest.distance/1000).toFixed(1)}km`;
    const statusColor = STATUS_COLORS[nearest.road.status_trafego] || '#ffffff';
    roadInfoHtml = `
      <div style="margin: 8px 0; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border-color);">
        <strong style="font-size: 0.78rem; color: var(--text-heading); display: block;">Via mais próxima: ${nearest.road.nome}</strong>
        <span style="font-size: 0.72rem; color: var(--text-muted);">Distância: ${distText}</span><br>
        <span style="font-size: 0.72rem; color: ${statusColor}; font-weight: 700;">Situação: ${nearest.road.status_trafego.toUpperCase()}</span>
      </div>
    `;
  }
  
  const roadNameEscaped = nearest.road && nearest.distance <= 400 ? nearest.road.nome.replace(/'/g, "\\'") : '';
  
  return `
    <div style="font-family: var(--font-family); min-width: 200px;">
      <strong style="color: var(--text-heading); font-size: 0.85rem; display: block;">${label}</strong>
      <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}</span>
      ${roadInfoHtml}
      <button onclick="preFillIncidentForm(${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}, '${roadNameEscaped}')" style="
        background: var(--color-accent);
        color: #000;
        border: none;
        padding: 5px 10px;
        border-radius: 6px;
        font-size: 0.75rem;
        cursor: pointer;
        font-weight: 600;
        width: 100%;
        margin-top: 4px;
        transition: var(--transition-fast);
      ">Registrar Alerta / Descrição</button>
    </div>
  `;
}

// Preenche o formulário de registro de incidente ao clicar no botão do popup
window.preFillIncidentForm = function(lat, lng, roadName) {
  document.getElementById('rep-lat').value = lat;
  document.getElementById('rep-lng').value = lng;
  
  const descField = document.getElementById('rep-desc');
  let draftText = '';
  if (roadName) {
    draftText = `Ocorrência na via ${roadName}: `;
  }
  descField.value = draftText;
  
  map.closePopup();
  
  const sidebarRight = document.querySelector('.sidebar-right');
  if (sidebarRight) {
    sidebarRight.scrollTop = 0;
  }
  descField.focus();
};
