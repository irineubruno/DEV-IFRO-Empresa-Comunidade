-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- 2. Tabela de Perfis de Usuários
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    funcao TEXT NOT NULL DEFAULT 'motorista' CHECK (funcao IN ('motorista', 'produtor', 'administrador', 'secretaria_obras')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS em perfis
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (RLS) para Perfis
CREATE POLICY "Permitir leitura de perfis para autenticados" 
    ON public.perfis FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Permitir atualização do próprio perfil" 
    ON public.perfis FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 3. Tabela de Linhas Rurais (Estradas)
CREATE TABLE IF NOT EXISTS public.linhas_rurais (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL,
    status_trafego TEXT NOT NULL DEFAULT 'livre' CHECK (status_trafego IN ('livre', 'atencao', 'bloqueado')),
    indice_risco NUMERIC(4,2) NOT NULL DEFAULT 0.00 CHECK (indice_risco >= 0.00 AND indice_risco <= 10.00),
    geom GEOMETRY(LineString, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar índice espacial para buscas geográficas rápidas
CREATE INDEX IF NOT EXISTS idx_linhas_rurais_geom ON public.linhas_rurais USING GIST(geom);

-- Habilitar RLS em linhas_rurais
ALTER TABLE public.linhas_rurais ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (RLS) para Linhas Rurais
CREATE POLICY "Permitir leitura de linhas para autenticados" 
    ON public.linhas_rurais FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Permitir modificação apenas para administradores e secretaria" 
    ON public.linhas_rurais FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis 
            WHERE perfis.id = auth.uid() 
            AND perfis.funcao IN ('administrador', 'secretaria_obras')
        )
    );

-- 4. Tabela de Reportes de Incidentes (Pontos Críticos)
CREATE TABLE IF NOT EXISTS public.reportes_incidentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tipo_problema TEXT NOT NULL CHECK (tipo_problema IN ('atolamento', 'erosao', 'bueiro_danificado', 'ponte_caida', 'alagamento')),
    descricao TEXT,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    geom GEOMETRY(Point, 4326),
    foto_url TEXT,
    resolvido BOOLEAN NOT NULL DEFAULT false,
    data_criacao_dispositivo TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar índice espacial para busca geográfica rápida de incidentes
CREATE INDEX IF NOT EXISTS idx_reportes_incidentes_geom ON public.reportes_incidentes USING GIST(geom);

-- Habilitar RLS em reportes_incidentes
ALTER TABLE public.reportes_incidentes ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (RLS) para Incidentes
CREATE POLICY "Permitir leitura de incidentes para autenticados" 
    ON public.reportes_incidentes FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Permitir inserção de incidentes para autenticados" 
    ON public.reportes_incidentes FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Permitir atualização de incidentes próprios ou por administradores" 
    ON public.reportes_incidentes FOR UPDATE 
    TO authenticated 
    USING (
        auth.uid() = usuario_id 
        OR EXISTS (
            SELECT 1 FROM public.perfis 
            WHERE perfis.id = auth.uid() 
            AND perfis.funcao IN ('administrador', 'secretaria_obras')
        )
    );

-- 5. Tabela de Histórico de Rotas Percorridas
CREATE TABLE IF NOT EXISTS public.historico_rotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    geom GEOMETRY(LineString, 4326) NOT NULL,
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar índice espacial para busca geográfica de rotas
CREATE INDEX IF NOT EXISTS idx_historico_rotas_geom ON public.historico_rotas USING GIST(geom);

-- Habilitar RLS em historico_rotas
ALTER TABLE public.historico_rotas ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (RLS) para Histórico de Rotas
CREATE POLICY "Gerenciamento de rotas próprias para autenticados" 
    ON public.historico_rotas FOR ALL 
    TO authenticated 
    USING (auth.uid() = usuario_id)
    WITH CHECK (auth.uid() = usuario_id);

---
--- TRIGGERS E FUNÇÕES AUXILIARES
---

-- Trigger 1: Sincronizar criação de novos usuários no Auth com a tabela Perfis
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, funcao)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Usuário Novo'),
    COALESCE(NEW.raw_user_meta_data->>'funcao', 'motorista')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger 2: Gerar geometria de Ponto automaticamente a partir de Lat/Lng em incidentes
CREATE OR REPLACE FUNCTION public.set_reportes_incidentes_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_set_reportes_incidentes_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.reportes_incidentes
  FOR EACH ROW EXECUTE FUNCTION public.set_reportes_incidentes_geom();

-- Trigger 3: Atualizar campo updated_at de linhas rurais
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_update_linhas_rurais_updated_at
  BEFORE UPDATE ON public.linhas_rurais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

---
--- HABILITAÇÃO DO REALTIME
---

-- Habilitar Realtime para escuta do Dashboard Web
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.reportes_incidentes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.linhas_rurais;
