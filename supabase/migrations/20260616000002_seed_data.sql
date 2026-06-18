-- Limpar dados de seed anteriores se existirem
DELETE FROM public.linhas_rurais;

-- Seed de Linhas Rurais em Ariquemes/RO com geometrias LineString realistas
INSERT INTO public.linhas_rurais (nome, status_trafego, indice_risco, geom)
VALUES 
(
  'Linha C-65 (Norte)', 
  'livre', 
  1.20, 
  ST_GeomFromText('LINESTRING(-63.0408 -9.9133, -63.0550 -9.8900, -63.0700 -9.8700, -63.0850 -9.8500)', 4326)
),
(
  'Linha C-70 (Leste)', 
  'atencao', 
  4.50, 
  ST_GeomFromText('LINESTRING(-63.0408 -9.9133, -63.0200 -9.9050, -62.9900 -9.8950, -62.9600 -9.8800)', 4326)
),
(
  'Linha C-80 (Sul)', 
  'bloqueado', 
  8.10, 
  ST_GeomFromText('LINESTRING(-63.0408 -9.9133, -63.0300 -9.9400, -63.0200 -9.9600, -63.0100 -9.9800)', 4326)
);
