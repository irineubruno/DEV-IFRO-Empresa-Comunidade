-- 1. Expandir constraint de tipo_problema em reportes_incidentes
ALTER TABLE public.reportes_incidentes DROP CONSTRAINT IF EXISTS reportes_incidentes_tipo_problema_check;
ALTER TABLE public.reportes_incidentes ADD CONSTRAINT check_tipo_problema CHECK (tipo_problema IN ('atolamento', 'erosao', 'bueiro_danificado', 'ponte_caida', 'alagamento', 'buraco_severo', 'queda_arvore'));

-- 2. Adicionar colunas em linhas_rurais
ALTER TABLE public.linhas_rurais ADD COLUMN IF NOT EXISTS veiculos_principais TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.linhas_rurais ADD COLUMN IF NOT EXISTS pluviometria_simulada NUMERIC(4,1) DEFAULT 0.0;

-- 3. Atualizar a stored procedure calcular_risco_vias com suporte a pluviometria local e pesos por tráfego
CREATE OR REPLACE FUNCTION public.calcular_risco_vias(chuva_mm NUMERIC)
RETURNS VOID AS $$
DECLARE
  peso_chuva NUMERIC := 0.4;
  peso_incidentes NUMERIC := 0.6;
BEGIN
  UPDATE public.linhas_rurais lr
  SET 
    -- Se a via tiver pluviometria local simulada (> 0), usa ela. Senão usa a chuva_mm geral.
    indice_risco = LEAST(10.00, GREATEST(0.00, 
      (
        (peso_chuva * COALESCE(NULLIF(lr.pluviometria_simulada, 0), chuva_mm)) + 
        (peso_incidentes * COALESCE((
          SELECT COUNT(*) 
          FROM public.reportes_incidentes ri 
          WHERE ri.resolvido = false 
          AND ST_DWithin(lr.geom, ri.geom, 0.0015) -- Cerca de 150 metros no SRID 4326
        ), 0) * 2.5)
      ) * 
      -- Multiplicadores de Risco conforme veículos principais
      CASE 
        WHEN 'onibus_escolar' = ANY(lr.veiculos_principais) THEN 1.3
        WHEN 'caminhao_madeira' = ANY(lr.veiculos_principais) OR 'caminhao_graos' = ANY(lr.veiculos_principais) THEN 1.2
        WHEN 'pedestre' = ANY(lr.veiculos_principais) THEN 1.1
        ELSE 1.0
      END
    )),
    status_trafego = CASE 
      WHEN (
        ((peso_chuva * COALESCE(NULLIF(lr.pluviometria_simulada, 0), chuva_mm)) + 
         (peso_incidentes * COALESCE((SELECT COUNT(*) FROM public.reportes_incidentes ri WHERE ri.resolvido = false AND ST_DWithin(lr.geom, ri.geom, 0.0015)), 0) * 2.5)) * 
        CASE 
          WHEN 'onibus_escolar' = ANY(lr.veiculos_principais) THEN 1.3
          WHEN 'caminhao_madeira' = ANY(lr.veiculos_principais) OR 'caminhao_graos' = ANY(lr.veiculos_principais) THEN 1.2
          WHEN 'pedestre' = ANY(lr.veiculos_principais) THEN 1.1
          ELSE 1.0
        END
      ) >= 7.0 THEN 'bloqueado'
      WHEN (
        ((peso_chuva * COALESCE(NULLIF(lr.pluviometria_simulada, 0), chuva_mm)) + 
         (peso_incidentes * COALESCE((SELECT COUNT(*) FROM public.reportes_incidentes ri WHERE ri.resolvido = false AND ST_DWithin(lr.geom, ri.geom, 0.0015)), 0) * 2.5)) * 
        CASE 
          WHEN 'onibus_escolar' = ANY(lr.veiculos_principais) THEN 1.3
          WHEN 'caminhao_madeira' = ANY(lr.veiculos_principais) OR 'caminhao_graos' = ANY(lr.veiculos_principais) THEN 1.2
          WHEN 'pedestre' = ANY(lr.veiculos_principais) THEN 1.1
          ELSE 1.0
        END
      ) >= 3.5 THEN 'atencao'
      ELSE 'livre'
    END,
    updated_at = now()
  WHERE lr.id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Distribuição realista de veículos nas linhas rurais importadas para o teste
UPDATE public.linhas_rurais 
SET veiculos_principais = ARRAY['carro_passeio', 'moto'] 
WHERE id % 3 = 0;

UPDATE public.linhas_rurais 
SET veiculos_principais = ARRAY['carro_passeio', 'moto', 'onibus_escolar'] 
WHERE id % 3 = 1;

UPDATE public.linhas_rurais 
SET veiculos_principais = ARRAY['caminhao_graos', 'caminhao_madeira', 'carro_passeio'] 
WHERE id % 3 = 2;
