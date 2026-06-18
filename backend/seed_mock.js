require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function seed() {
  console.log('Iniciando script de mock HTTP...');

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // Buscar linhas
  const resLinhas = await fetch(`${SUPABASE_URL}/rest/v1/linhas_rurais?select=id&limit=15`, { headers });
  const linhas = await resLinhas.json();
  const ids = linhas.map(l => l.id);

  // Limpar todas
  for (let id of ids) {
    await fetch(`${SUPABASE_URL}/rest/v1/linhas_rurais?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status_trafego: 'livre' })
    });
  }

  const atencaoIds = ids.slice(0, 5);
  for (let id of atencaoIds) {
    await fetch(`${SUPABASE_URL}/rest/v1/linhas_rurais?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status_trafego: 'atencao' })
    });
  }

  const bloqueadoIds = ids.slice(5, 8);
  for (let id of bloqueadoIds) {
    await fetch(`${SUPABASE_URL}/rest/v1/linhas_rurais?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status_trafego: 'bloqueado' })
    });
  }

  console.log(`✅ Atualizadas ${atencaoIds.length} linhas como 'atencao' e ${bloqueadoIds.length} como 'bloqueado'.`);

  // Categorias
  const tipos = ['atolamento', 'erosao', 'alagamento'];
  const incidentesParaInserir = [];

  for (const tipo of tipos) {
    for (let i = 0; i < 3; i++) {
      const lat = -9.9133 + (Math.random() - 0.5) * 0.1;
      const lng = -63.0408 + (Math.random() - 0.5) * 0.1;
      
      incidentesParaInserir.push({
        tipo_problema: tipo,
        descricao: `Incidente de ${tipo} gerado aleatoriamente para teste #${i+1}`,
        latitude: lat,
        longitude: lng,
        resolvido: false,
        data_criacao_dispositivo: new Date().toISOString()
      });
    }
  }

  const resInc = await fetch(`${SUPABASE_URL}/rest/v1/reportes_incidentes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(incidentesParaInserir)
  });

  if (!resInc.ok) {
    console.error('Erro:', await resInc.text());
  } else {
    console.log(`✅ Inseridos ${incidentesParaInserir.length} incidentes.`);
  }

  console.log('Fim.');
}

seed();
