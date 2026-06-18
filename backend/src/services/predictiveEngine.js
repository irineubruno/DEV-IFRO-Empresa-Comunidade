const cron = require('node-cron');
const axios = require('axios');
const { supabaseAdmin } = require('./supabase');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const LAT = process.env.ARIQUEMES_LAT || '-9.9133';
const LON = process.env.ARIQUEMES_LON || '-63.0408';

// Função para buscar chuva prevista nas próximas 24h
const getPrecipitationForecast = async () => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=precipitation_sum&timezone=auto&forecast_days=1`;
    console.log(`[API CLIMA] Consultando Open-Meteo para Ariquemes/RO (${LAT}, ${LON})...`);
    
    const response = await axios.get(url);
    const totalRain = response.data.daily.precipitation_sum[0];
    
    console.log(`[API CLIMA] Chuva prevista pelo Open-Meteo: ${totalRain} mm para hoje`);
    return parseFloat(totalRain) || 0.0;
  } catch (error) {
    console.error('❌ Erro ao consultar API de Clima Open-Meteo, usando fallback de 5.0 mm:', error.message);
    return 5.0; // Fallback seguro
  }
};

// Executa o cálculo de risco no banco
const runRiskAnalysis = async (customRainMm) => {
  console.log('🔄 Executando análise preditiva de risco para as linhas rurais...');
  try {
    const chuvaPrevista = customRainMm !== undefined ? customRainMm : await getPrecipitationForecast();
    
    // Chamar a função calcular_risco_vias no Postgres via Supabase RPC
    const { error } = await supabaseAdmin.rpc('calcular_risco_vias', {
      chuva_mm: chuvaPrevista
    });

    if (error) {
      throw error;
    }

    console.log(`✅ Análise preditiva concluída com sucesso para chuva de ${chuvaPrevista} mm.`);
  } catch (error) {
    console.error('❌ Erro durante a execução da engine de risco:', error);
  }
};

// Inicializar e Agendar o Cron Job
const startEngine = () => {
  // Rodar imediatamente na inicialização do servidor
  runRiskAnalysis();

  // Agendar para rodar de hora em hora (0 * * * *)
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Cron acionado: Recalculando riscos de tráfego...');
    runRiskAnalysis();
  });
  
  console.log('⚙️ Motor Preditivo de Trafegabilidade inicializado com cron hourly.');
};

module.exports = {
  startEngine,
  runRiskAnalysis
};
