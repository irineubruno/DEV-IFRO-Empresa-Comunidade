-- Adicionar novos campos do CENSIPAM na tabela linhas_rurais
ALTER TABLE public.linhas_rurais
  ADD COLUMN IF NOT EXISTS tipo_via TEXT,
  ADD COLUMN IF NOT EXISTS jurisdicao TEXT,
  ADD COLUMN IF NOT EXISTS pavimentada BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT 'CENSIPAM_WFS_2019',
  ADD COLUMN IF NOT EXISTS ano_base INTEGER DEFAULT 2019;

-- Deletar as linhas temporárias inseridas no passo anterior
DELETE FROM public.linhas_rurais;
