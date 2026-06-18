const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { syncOfflineData } = require('./controllers/syncController');
const { startEngine, runRiskAnalysis } = require('./services/predictiveEngine');
const { listAreas, createArea, updateArea, deleteArea } = require('./controllers/areasController');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Permitir payloads maiores para rotas/fotos em batch
app.use(express.static('public', { extensions: ['html'] }));

// Rotas da API
app.post('/api/v1/sync', syncOfflineData);

// Rotas de Áreas Monitoradas (Polígonos)
app.get('/api/v1/areas', listAreas);
app.post('/api/v1/areas', createArea);
app.patch('/api/v1/areas/:id', updateArea);
app.delete('/api/v1/areas/:id', deleteArea);

// Rota administrativa para forçar o recálculo imediato (útil para testes e apresentações do Pitch)
app.post('/api/v1/recalculate', async (req, res) => {
  try {
    const { rainMm } = req.body;
    await runRiskAnalysis(rainMm !== undefined ? parseFloat(rainMm) : undefined);
    return res.status(200).json({ message: 'Recálculo preditivo forçado e executado com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao forçar recálculo: ' + error.message });
  }
});

// Endpoint de Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Inicialização do Servidor e da Engine
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend rodando na porta ${PORT}`);
  
  // Iniciar Cron Job do Motor Preditivo
  startEngine();
});
