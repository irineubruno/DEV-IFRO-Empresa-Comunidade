const { supabaseAdmin } = require('../services/supabase');

// Listar todas as áreas monitoradas
const listAreas = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('areas_monitoradas')
      .select('id, nome, descricao, status_situacao, geom, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar áreas: ' + error.message });
    }

    return res.status(200).json({ areas: data });
  } catch (err) {
    console.error('Erro interno ao listar áreas:', err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

// Criar nova área monitorada
const createArea = async (req, res) => {
  try {
    const { nome, descricao, status_situacao, coordinates } = req.body;

    if (!nome || !coordinates || coordinates.length < 3) {
      return res.status(400).json({ error: 'Nome e ao menos 3 coordenadas são obrigatórios' });
    }

    // Converter array de coordenadas [[lng, lat], ...] para WKT Polygon
    // Fechar o polígono se não estiver fechado
    const coords = [...coordinates];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([...first]);
    }

    const wktPoints = coords.map(c => `${c[0]} ${c[1]}`).join(', ');
    const wktPolygon = `SRID=4326;POLYGON((${wktPoints}))`;

    const { data, error } = await supabaseAdmin
      .from('areas_monitoradas')
      .insert({
        nome,
        descricao: descricao || null,
        status_situacao: status_situacao || 'normal',
        geom: wktPolygon
      })
      .select('id, nome, descricao, status_situacao, geom, created_at');

    if (error) {
      console.error('Erro ao criar área:', error);
      return res.status(500).json({ error: 'Erro ao salvar área: ' + error.message });
    }

    return res.status(201).json({ message: 'Área monitorada criada com sucesso', area: data[0] });
  } catch (err) {
    console.error('Erro interno ao criar área:', err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

// Atualizar status de uma área
const updateArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, status_situacao } = req.body;

    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (descricao !== undefined) updateData.descricao = descricao;
    if (status_situacao !== undefined) updateData.status_situacao = status_situacao;

    const { data, error } = await supabaseAdmin
      .from('areas_monitoradas')
      .update(updateData)
      .eq('id', id)
      .select('id, nome, descricao, status_situacao, updated_at');

    if (error) {
      return res.status(500).json({ error: 'Erro ao atualizar área: ' + error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Área não encontrada' });
    }

    return res.status(200).json({ message: 'Área atualizada com sucesso', area: data[0] });
  } catch (err) {
    console.error('Erro interno ao atualizar área:', err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

// Remover área
const deleteArea = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('areas_monitoradas')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Erro ao remover área: ' + error.message });
    }

    return res.status(200).json({ message: 'Área removida com sucesso' });
  } catch (err) {
    console.error('Erro interno ao remover área:', err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

module.exports = {
  listAreas,
  createArea,
  updateArea,
  deleteArea
};
