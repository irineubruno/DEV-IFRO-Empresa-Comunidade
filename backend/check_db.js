const { supabaseAdmin } = require('./src/services/supabase');

async function check() {
  try {
    const { data, error } = await supabaseAdmin
      .from('reportes_incidentes')
      .select('id, tipo_problema, latitude, longitude, resolvido, created_at');
      
    if (error) {
      console.error('Erro ao consultar via Supabase Client:', error.message);
      return;
    }
    
    console.log(`Encontrados ${data.length} incidentes no banco:`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro no script:', err.message);
  }
}

check();
