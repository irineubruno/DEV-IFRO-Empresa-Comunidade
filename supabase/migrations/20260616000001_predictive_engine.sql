-- Função PostGIS para calcular e atualizar o risco das linhas de tráfego com base na chuva e incidentes próximos
CREATE OR REPLACE FUNCTION public.calcular_risco_vias(chuva_mm NUMERIC)
RETURNS VOID AS $$
DECLARE
  peso_chuva NUMERIC := 0.4;
  peso_incidentes NUMERIC := 0.6;
  risco_calculado NUMERIC;
BEGIN
  -- Atualizar o índice de risco e o status de tráfego de cada linha rural
  UPDATE public.linhas_rurais lr
  SET 
    indice_risco = LEAST(10.00, GREATEST(0.00, 
      (peso_chuva * chuva_mm) + 
      (peso_incidentes * COALESCE((
        SELECT COUNT(*) 
        FROM public.reportes_incidentes ri 
        WHERE ri.resolvido = false 
        AND ST_DWithin(lr.geom, ri.geom, 0.0015) -- Cerca de 150 metros no SRID 4326
      ), 0) * 2.5)
    )),
    status_trafego = CASE 
      -- Se o risco calculado ultrapassar thresholds
      WHEN ((peso_chuva * chuva_mm) + (peso_incidentes * COALESCE((SELECT COUNT(*) FROM public.reportes_incidentes ri WHERE ri.resolvido = false AND ST_DWithin(lr.geom, ri.geom, 0.0015)), 0) * 2.5)) >= 7.0 THEN 'bloqueado'
      WHEN ((peso_chuva * chuva_mm) + (peso_incidentes * COALESCE((SELECT COUNT(*) FROM public.reportes_incidentes ri WHERE ri.resolvido = false AND ST_DWithin(lr.geom, ri.geom, 0.0015)), 0) * 2.5)) >= 3.5 THEN 'atencao'
      ELSE 'livre'
    END,
    updated_at = now()
  WHERE lr.id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
