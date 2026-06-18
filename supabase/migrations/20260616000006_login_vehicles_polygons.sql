-- ============================================================
-- MIGRATION 006: Login, Veículos, Tipos Expandidos e Polígonos
-- ============================================================

-- 1. Atualizar constraint de funcao na tabela perfis para incluir 'cidadao'
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_funcao_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_funcao_check
  CHECK (funcao IN ('motorista', 'produtor', 'administrador', 'secretaria_obras', 'cidadao'));

-- 2. Adicionar campos de veículo na tabela perfis
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS veiculo_tipo TEXT;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS veiculo_placa TEXT;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS veiculo_descricao TEXT;

-- 3. Expandir constraint de tipo_problema para incluir os 3 novos tipos
ALTER TABLE public.reportes_incidentes DROP CONSTRAINT IF EXISTS check_tipo_problema;
ALTER TABLE public.reportes_incidentes DROP CONSTRAINT IF EXISTS reportes_incidentes_tipo_problema_check;
ALTER TABLE public.reportes_incidentes ADD CONSTRAINT check_tipo_problema
  CHECK (tipo_problema IN (
    'atolamento', 'erosao', 'bueiro_danificado', 'ponte_caida', 'alagamento',
    'buraco_severo', 'queda_arvore',
    'deslizamento', 'animal_na_pista', 'obra_em_andamento'
  ));

-- 4. Criar tabela areas_monitoradas para polígonos desenhados
CREATE TABLE IF NOT EXISTS public.areas_monitoradas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    status_situacao TEXT NOT NULL DEFAULT 'normal'
      CHECK (status_situacao IN ('normal', 'atencao', 'critico', 'interditado')),
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice espacial para buscas geográficas
CREATE INDEX IF NOT EXISTS idx_areas_monitoradas_geom ON public.areas_monitoradas USING GIST(geom);

-- Habilitar RLS
ALTER TABLE public.areas_monitoradas ENABLE ROW LEVEL SECURITY;

-- Políticas públicas (Hackathon)
CREATE POLICY "Permitir leitura pública de áreas"
    ON public.areas_monitoradas FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Permitir inserção pública de áreas"
    ON public.areas_monitoradas FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Permitir atualização pública de áreas"
    ON public.areas_monitoradas FOR UPDATE
    TO public
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Permitir deleção pública de áreas"
    ON public.areas_monitoradas FOR DELETE
    TO public
    USING (true);

-- Trigger de updated_at para areas_monitoradas
CREATE OR REPLACE TRIGGER tr_update_areas_monitoradas_updated_at
  BEFORE UPDATE ON public.areas_monitoradas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Adicionar areas_monitoradas ao Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.areas_monitoradas;

-- 6. Atualizar trigger handle_new_user para capturar veículo e funcao do metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, funcao, veiculo_tipo, veiculo_placa, veiculo_descricao)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Usuário Novo'),
    COALESCE(NEW.raw_user_meta_data->>'funcao', 'cidadao'),
    NEW.raw_user_meta_data->>'veiculo_tipo',
    NEW.raw_user_meta_data->>'veiculo_placa',
    NEW.raw_user_meta_data->>'veiculo_descricao'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS público para perfis (leitura e inserção para Hackathon)
DROP POLICY IF EXISTS "Permitir leitura de perfis para autenticados" ON public.perfis;
CREATE POLICY "Permitir leitura pública de perfis"
    ON public.perfis FOR SELECT
    TO public
    USING (true);
