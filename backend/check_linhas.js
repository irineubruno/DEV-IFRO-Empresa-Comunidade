const { supabaseAdmin } = require('./src/services/supabase');

async function check() {
  try {
    const { data, error } = await supabaseAdmin
      .from('linhas_rurais')
      .select('id, nome, status_trafego, indice_risco, geom');
      
    if (error) {
      console.error('Erro:', error.message);
      return;
    }
    
    console.log(`Encontradas ${data.length} linhas rurais:`);
    data.forEach(l => {
      const coords = l.geom ? l.geom.coordinates : 'SEM GEOM';
      console.log(`  ID=${l.id} | ${l.nome} | ${l.status_trafego} | risco=${l.indice_risco}`);
      if (l.geom) {
        console.log(`    Primeiro ponto: [${coords[0]}]`);
        console.log(`    Último ponto:  [${coords[coords.length-1]}]`);
        console.log(`    Total pontos: ${coords.length}`);
      }
    });
  } catch (err) {
    console.error('Erro no script:', err.message);
  }
}

check();
