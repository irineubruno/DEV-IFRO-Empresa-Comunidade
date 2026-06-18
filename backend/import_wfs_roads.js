const fs = require('fs');
const { supabaseAdmin } = require('./src/services/supabase');

const geojsonPath = '/home/bisn/.gemini/antigravity-ide/brain/2b8e0df2-2e56-4349-8086-458c152ae9bb/scratch/sipam_wfs_ariquemes.geojson';

function coordinatesToWKT(coords, type) {
  if (type === 'LineString') {
    const points = coords.map(p => `${p[0]} ${p[1]}`).join(', ');
    return `LINESTRING(${points})`;
  }
  return null;
}

async function run() {
  try {
    const rawData = fs.readFileSync(geojsonPath, 'utf8');
    const data = JSON.parse(rawData);
    
    const features = data.features || [];
    
    console.log(`Loaded ${features.length} features from WFS GeoJSON.`);
    
    const recordsToInsert = [];
    
    features.forEach(f => {
      if (!f.geometry) return;
      
      const p = f.properties;
      let nome = p.nome;
      if (!nome) {
        nome = p.sigla ? p.sigla : `Via ${p.jurisidicao || 'Local'} Sem Nome`;
      }
      
      const pavimentada = p.revestimento && (p.revestimento.toLowerCase().includes('asfalto') || p.revestimento.toLowerCase().includes('pavimenta') || p.revestimento.toLowerCase().includes('concreto'));
      
      const baseRecord = {
        nome: nome,
        tipo_via: p.tipovia || 'Desconhecido',
        jurisdicao: p.jurisidicao || 'Municipal',
        pavimentada: pavimentada,
        fonte: 'CENSIPAM_WFS_2019',
        ano_base: 2019,
        status_trafego: 'livre', // Default
        indice_risco: 0
      };

      if (f.geometry.type === 'LineString') {
        const wkt = coordinatesToWKT(f.geometry.coordinates, 'LineString');
        recordsToInsert.push({ ...baseRecord, geom: `SRID=4326;${wkt}` });
      } else if (f.geometry.type === 'MultiLineString') {
        // Split MultiLineString into multiple LineStrings
        f.geometry.coordinates.forEach(lineCoords => {
          const wkt = coordinatesToWKT(lineCoords, 'LineString');
          recordsToInsert.push({ ...baseRecord, geom: `SRID=4326;${wkt}` });
        });
      }
    });
    
    console.log(`Prepared ${recordsToInsert.length} records for insertion. Starting bulk insert...`);
    
    // Batch insert 50 at a time
    const BATCH_SIZE = 50;
    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
      const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
      const { data: resData, error } = await supabaseAdmin.from('linhas_rurais').insert(batch);
      
      if (error) {
        console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error.message);
      } else {
        console.log(`Inserted batch ${i / BATCH_SIZE + 1} (${batch.length} records)`);
      }
    }
    
    console.log('Import completed!');
    
  } catch (err) {
    console.error('Script failed:', err);
  }
}

run();
