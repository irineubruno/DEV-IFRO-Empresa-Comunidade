// Configurações do Supabase (Mesmas de app.js)
const SUPABASE_URL = "https://baas-trafegoalerta.bisn.com.br";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzgxNTk5MjA4LCJleHAiOjQ5MzUxOTkyMDh9.EhKoHMrwcwgOY9QYNi0ZP09GeeouHZKLrNk_62jy9-c";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Coordenadas padrão de Ariquemes
const ARIQUEMES_LAT = -9.978424;
const ARIQUEMES_LON = -63.020744;

// Cores dos Status
const STATUS_COLORS = {
  livre: '#00d97e',
  atencao: '#ffa000',
  bloqueado: '#ff3b30'
};

// Configurações de Ícones e Rótulos de Incidentes
const INCIDENT_CONFIGS = {
  atolamento:        { icon: 'car',             color: '#ff3b30', label: 'Atolamento de Veículo' },
  erosao:            { icon: 'mountain-snow',    color: '#ffa000', label: 'Erosão Severa' },
  bueiro_danificado: { icon: 'wrench',           color: '#a1a1aa', label: 'Bueiro Danificado' },
  ponte_caida:       { icon: 'construction',     color: '#ff0080', label: 'Ponte Danificada/Caída' },
  alagamento:        { icon: 'waves',            color: '#00b4d8', label: 'Alagamento' },
  buraco_severo:     { icon: 'circle-alert',     color: '#eab308', label: 'Buraco Severo' },
  queda_arvore:      { icon: 'tree-pine',        color: '#22c55e', label: 'Queda de Árvore' },
  deslizamento:      { icon: 'triangle-alert',   color: '#a16207', label: 'Deslizamento de Terra' },
  animal_na_pista:   { icon: 'bug',              color: '#a855f7', label: 'Animal na Pista' },
  obra_em_andamento: { icon: 'hard-hat',         color: '#f97316', label: 'Obra em Andamento' }
};

// Ícones de clima
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

// Estado da Aplicação
let currentUser = null;
let currentUserProfile = null;
let rawIncidentesList = [];
let rawViasList = [];

// ==========================================================================
// INICIALIZAÇÃO
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  lucide.createIcons();

  // Verificar Autenticação
  const isAuth = await checkAuth();
  if (!isAuth) return;

  // Carregar dados climáticos e dados das tabelas
  await Promise.all([
    loadWeatherData(),
    loadIncidentesData(),
    loadViasData()
  ]);

  setupRealtime();
  setupUIEvents();
});

// ==========================================================================
// AUTENTICAÇÃO
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
// TEMA CLARO / ESCURO
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

  // Re-renderizar ícones
  lucide.createIcons();
}

// ==========================================================================
// CARREGAMENTO DE CLIMA DETALHADO (CONFORME APP.JS)
// ==========================================================================
async function loadWeatherData() {
  try {
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
    console.error('Erro ao carregar dados climáticos Open-Meteo na lista:', err);
    document.getElementById('climate-alert-text').innerText =
      'Sem conexão com API de clima. Usando simulação local.';
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

  // === PREVISÃO POR HORA ===
  renderHourlyForecast(data.hourly);
}

function renderHourlyForecast(hourly) {
  const container = document.getElementById('hourly-forecast');
  container.innerHTML = '';

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

// ==========================================================================
// CARREGAMENTO E RENDERIZAÇÃO: PONTOS CRÍTICOS
// ==========================================================================
async function loadIncidentesData() {
  const { data, error } = await supabaseClient
    .from('reportes_incidentes')
    .select('id, tipo_problema, descricao, latitude, longitude, resolvido, data_criacao_dispositivo')
    .order('data_criacao_dispositivo', { ascending: false });

  if (error) {
    console.error('Erro ao buscar incidentes:', error);
    return;
  }

  rawIncidentesList = data || [];
  renderIncidentesTable();
}

function renderIncidentesTable() {
  const tbody = document.getElementById('tbody-incidentes');
  tbody.innerHTML = '';

  const searchText = document.getElementById('search-incidentes').value.toLowerCase();
  const filterTipo = document.getElementById('filter-incidentes-tipo').value;
  const filterStatus = document.getElementById('filter-incidentes-status').value;

  const filtered = rawIncidentesList.filter(inc => {
    // Busca textual
    const descMatches = (inc.descricao || '').toLowerCase().includes(searchText);
    const tipoLabel = (INCIDENT_CONFIGS[inc.tipo_problema]?.label || inc.tipo_problema).toLowerCase();
    const textMatches = descMatches || tipoLabel.includes(searchText);

    // Filtro por tipo
    const tipoMatches = !filterTipo || inc.tipo_problema === filterTipo;

    // Filtro por status
    let statusMatches = true;
    if (filterStatus === 'ativos') statusMatches = !inc.resolvido;
    else if (filterStatus === 'resolvidos') statusMatches = inc.resolvido;

    return textMatches && tipoMatches && statusMatches;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-state">
          <i data-lucide="alert-circle"></i> Nenhum registro de incidente encontrado.
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  filtered.forEach(inc => {
    const config = INCIDENT_CONFIGS[inc.tipo_problema] || { icon: 'alert-triangle', color: '#ffa000', label: inc.tipo_problema };
    const date = new Date(inc.data_criacao_dispositivo).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const statusClass = inc.resolvido ? 'resolved' : 'active';
    const statusText = inc.resolvido ? 'Resolvido' : 'Ativo';

    // Ações
    let actionsHtml = `
      <div class="table-actions">
        <a href="/?lat=${inc.latitude}&lng=${inc.longitude}&zoom=15" class="btn-table-action" title="Ver no Mapa">
          <i data-lucide="map-pin"></i>
        </a>
    `;

    // Botão de resolver visível apenas se não resolvido
    if (!inc.resolvido) {
      actionsHtml += `
        <button class="btn-table-action btn-resolve-check" onclick="resolverIncidente('${inc.id}')" title="Marcar como Resolvido">
          <i data-lucide="check"></i>
        </button>
      `;
    }

    actionsHtml += `</div>`;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <span style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
          <span style="
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background-color: ${config.color}20;
            color: ${config.color};
          ">
            <i data-lucide="${config.icon}" style="width:16px; height:16px;"></i>
          </span>
          ${config.label}
        </span>
      </td>
      <td>${inc.descricao || '<span style="color:var(--text-muted)">Sem descrição</span>'}</td>
      <td style="font-family: monospace; font-size: 0.82rem;">${parseFloat(inc.latitude).toFixed(6)}, ${parseFloat(inc.longitude).toFixed(6)}</td>
      <td>${date}</td>
      <td><span class="status-pill ${statusClass}">${statusText}</span></td>
      <td style="text-align: center;">${actionsHtml}</td>
    `;
    tbody.appendChild(row);
  });

  lucide.createIcons();
}

async function resolverIncidente(id) {
  if (!confirm('Deseja realmente marcar este incidente como resolvido?')) return;

  const { error } = await supabaseClient
    .from('reportes_incidentes')
    .update({ resolvido: true })
    .eq('id', id);

  if (error) {
    alert('Erro ao resolver incidente: ' + error.message);
  } else {
    // Forçar recálculo de risco no backend
    try {
      await fetch('/api/v1/recalculate', { method: 'POST' });
    } catch (err) {
      console.log('Backend offline ao recalcular riscos');
    }
    loadIncidentesData();
  }
}

// ==========================================================================
// CARREGAMENTO E RENDERIZAÇÃO: VIAS RURAIS (ESTRADAS)
// ==========================================================================
async function loadViasData() {
  // Nível 1: Tentar selecionar todas as colunas
  let { data, error } = await supabaseClient
    .from('linhas_rurais')
    .select('id, nome, status_trafego, indice_risco, tipo_via, jurisdicao, pavimentada, veiculos_principais, pluviometria_simulada, updated_at');

  if (error) {
    console.warn('⚠️ Erro ao buscar colunas estendidas das linhas rurais (Nível 1), tentando Nível 2 (sem veículos e chuva)...', error.message);
    
    // Nível 2: Tentar selecionar colunas existentes na migração 4
    const level2 = await supabaseClient
      .from('linhas_rurais')
      .select('id, nome, status_trafego, indice_risco, tipo_via, jurisdicao, pavimentada, updated_at');
      
    if (level2.error) {
      console.warn('⚠️ Erro no Nível 2, tentando Nível 3 (query mínima de compatibilidade)...', level2.error.message);
      
      // Nível 3: Query mínima
      const level3 = await supabaseClient
        .from('linhas_rurais')
        .select('id, nome, status_trafego, indice_risco, updated_at');
        
      if (level3.error) {
        console.error('❌ Erro crítico: Todas as queries para linhas_rurais falharam no banco:', level3.error);
        const tbody = document.getElementById('tbody-vias');
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="table-empty-state" style="color: var(--color-danger);">
              <i data-lucide="x-circle" style="color: var(--color-danger);"></i> Erro ao carregar dados do banco de dados: ${level3.error.message}
            </td>
          </tr>
        `;
        lucide.createIcons();
        return;
      }
      data = level3.data;
    } else {
      data = level2.data;
    }
  }

  rawViasList = data || [];
  renderViasTable();
  updateViasStats();
}

function renderViasTable() {
  const tbody = document.getElementById('tbody-vias');
  tbody.innerHTML = '';

  const searchText = document.getElementById('search-vias').value.toLowerCase();
  const filterStatus = document.getElementById('filter-vias-status').value;
  const filterPavimento = document.getElementById('filter-vias-pavimento').value;

  const filtered = rawViasList.filter(via => {
    // Busca textual
    const textMatches = via.nome.toLowerCase().includes(searchText) || 
                        (via.tipo_via || '').toLowerCase().includes(searchText) ||
                        (via.jurisdicao || '').toLowerCase().includes(searchText);

    // Filtro por status
    const statusMatches = !filterStatus || via.status_trafego === filterStatus;

    // Filtro por pavimento
    let pavimentoMatches = true;
    if (filterPavimento === 'asfalto') pavimentoMatches = via.pavimentada;
    else if (filterPavimento === 'terra') pavimentoMatches = !via.pavimentada;

    return textMatches && statusMatches && pavimentoMatches;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty-state">
          <i data-lucide="route"></i> Nenhuma via rural correspondente aos filtros.
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  filtered.forEach(via => {
    const risk = parseFloat(via.indice_risco);
    let riskColor = '#00d97e';
    if (risk >= 7.0) riskColor = '#ff3b30';
    else if (risk >= 3.5) riskColor = '#ffa000';

    const lastUpdate = new Date(via.updated_at).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });

    const vList = via.veiculos_principais || [];
    const vehiclesHtml = vList.length > 0
      ? vList.map(v => `<span style="font-size:0.75rem; background:rgba(0, 180, 216, 0.08); color:var(--color-accent); border:1px solid rgba(0,180,216,0.15); padding: 2px 6px; border-radius:6px; white-space:nowrap; margin-right:4px; display:inline-block; margin-bottom:4px;">${v.replace(/_/g, ' ')}</span>`).join('')
      : '<span style="color:var(--text-muted); font-size:0.78rem;">Nenhum cadastrado</span>';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div style="font-weight:600; color:var(--text-heading);">${via.nome}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${via.tipo_via || 'Vicinal'} • ${via.jurisdicao || 'Municipal'}</div>
      </td>
      <td><span class="status-pill ${via.status_trafego}">${via.status_trafego}</span></td>
      <td>
        <div class="risk-bar-wrapper">
          <div class="risk-bar-bg">
            <div class="risk-bar-fill" style="width: ${risk * 10}%; background-color: ${riskColor};"></div>
          </div>
          <span class="risk-value" style="color: ${riskColor};">${risk.toFixed(1)}</span>
        </div>
      </td>
      <td style="font-weight:500;">${via.pluviometria_simulada || 0} mm</td>
      <td>${via.pavimentada ? '🛣️ Asfalto' : '🚜 Terra'}</td>
      <td style="max-width:240px;">${vehiclesHtml}</td>
      <td style="font-size:0.82rem; color:var(--text-muted);">${lastUpdate}</td>
      <td style="text-align: center;">
        <div class="table-actions" style="justify-content:center;">
          <a href="/" class="btn-table-action" title="Visualizar no Mapa">
            <i data-lucide="map"></i>
          </a>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  lucide.createIcons();
}

function updateViasStats() {
  let livre = 0, atencao = 0, bloqueado = 0;
  rawViasList.forEach(v => {
    if (v.status_trafego === 'livre') livre++;
    else if (v.status_trafego === 'atencao') atencao++;
    else if (v.status_trafego === 'bloqueado') bloqueado++;
  });

  document.getElementById('stats-livre').innerText = livre;
  document.getElementById('stats-atencao').innerText = atencao;
  document.getElementById('stats-bloqueado').innerText = bloqueado;
}

// ==========================================================================
// EXPORTAÇÃO PARA CSV
// ==========================================================================
function exportToCSV(filename, headers, rows) {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Adiciona BOM para UTF-8 no Excel
  csvContent += headers.join(",") + "\r\n";
  
  rows.forEach(row => {
    const r = row.map(val => {
      // Tratar valores nulos, aspas e quebras de linha
      let cleanVal = val === null || val === undefined ? '' : String(val);
      cleanVal = cleanVal.replace(/"/g, '""');
      if (cleanVal.includes(',') || cleanVal.includes('\n') || cleanVal.includes('"')) {
        cleanVal = `"${cleanVal}"`;
      }
      return cleanVal;
    });
    csvContent += r.join(",") + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportIncidentes() {
  const headers = ["ID", "Tipo", "Descricao", "Latitude", "Longitude", "Status", "Data de Registro"];
  const rows = rawIncidentesList.map(inc => [
    inc.id,
    INCIDENT_CONFIGS[inc.tipo_problema]?.label || inc.tipo_problema,
    inc.descricao || '',
    inc.latitude,
    inc.longitude,
    inc.resolvido ? 'Resolvido' : 'Ativo',
    inc.data_criacao_dispositivo
  ]);
  exportToCSV("reporte_incidentes_ariquemes.csv", headers, rows);
}

function exportVias() {
  const headers = ["Nome", "Status de Trafego", "Indice de Risco", "Pluviometria Local (mm)", "Pavimentada", "Jurisdicao", "Ultima Atualizacao"];
  const rows = rawViasList.map(via => [
    via.nome,
    via.status_trafego,
    via.indice_risco,
    via.pluviometria_simulada || 0,
    via.pavimentada ? 'Sim' : 'Nao',
    via.jurisdicao || 'Municipal',
    via.updated_at
  ]);
  exportToCSV("trafegabilidade_vias_ariquemes.csv", headers, rows);
}

// ==========================================================================
// CONFIGURAÇÃO DOS EVENTOS DA UI
// ==========================================================================
function setupUIEvents() {
  // Toggle de Tema
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

  // Logout
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Alternância de Abas
  const tabIncidentes = document.getElementById('tab-incidentes');
  const tabVias = document.getElementById('tab-vias');
  const sectionIncidentes = document.getElementById('section-incidentes');
  const sectionVias = document.getElementById('section-vias');

  tabIncidentes.addEventListener('click', () => {
    tabIncidentes.classList.add('active');
    tabVias.classList.remove('active');
    sectionIncidentes.style.display = 'block';
    sectionVias.style.display = 'none';
  });

  tabVias.addEventListener('click', () => {
    tabVias.classList.add('active');
    tabIncidentes.classList.remove('active');
    sectionVias.style.display = 'block';
    sectionIncidentes.style.display = 'none';
  });

  // Filtros e buscas de Incidentes
  document.getElementById('search-incidentes').addEventListener('input', renderIncidentesTable);
  document.getElementById('filter-incidentes-tipo').addEventListener('change', renderIncidentesTable);
  document.getElementById('filter-incidentes-status').addEventListener('change', renderIncidentesTable);

  // Filtros e buscas de Vias
  document.getElementById('search-vias').addEventListener('input', renderViasTable);
  document.getElementById('filter-vias-status').addEventListener('change', renderViasTable);
  document.getElementById('filter-vias-pavimento').addEventListener('change', renderViasTable);

  // Exportar CSV
  document.getElementById('btn-export-incidentes').addEventListener('click', exportIncidentes);
  document.getElementById('btn-export-vias').addEventListener('click', exportVias);
}

// ==========================================================================
// CANAL EM TEMPO REAL (WEBSOCKETS)
// ==========================================================================
function setupRealtime() {
  supabaseClient
    .channel('db-list-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes_incidentes' }, payload => {
       console.log('Realtime List: Incidentes atualizados', payload);
       loadIncidentesData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'linhas_rurais' }, payload => {
       console.log('Realtime List: Vias atualizadas', payload);
       loadViasData();
    })
    .subscribe();
}
