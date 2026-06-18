-- 1. Alterar coluna usuario_id para ter default de auth.uid()
ALTER TABLE public.reportes_incidentes ALTER COLUMN usuario_id SET DEFAULT auth.uid();

-- 2. Remover políticas antigas de reportes_incidentes
DROP POLICY IF EXISTS "Permitir leitura de incidentes para autenticados" ON public.reportes_incidentes;
DROP POLICY IF EXISTS "Permitir inserção de incidentes para autenticados" ON public.reportes_incidentes;
DROP POLICY IF EXISTS "Permitir atualização de incidentes próprios ou por administradores" ON public.reportes_incidentes;

-- 3. Criar políticas relaxadas (Públicas) para reportes_incidentes (Essencial para testes rápidos no Hackathon)
CREATE POLICY "Permitir leitura pública de incidentes" 
    ON public.reportes_incidentes FOR SELECT 
    TO public 
    USING (true);

CREATE POLICY "Permitir inserção pública de incidentes" 
    ON public.reportes_incidentes FOR INSERT 
    TO public 
    WITH CHECK (true);

CREATE POLICY "Permitir atualização pública de incidentes" 
    ON public.reportes_incidentes FOR UPDATE 
    TO public 
    USING (true)
    WITH CHECK (true);

-- 4. Remover políticas antigas de linhas_rurais
DROP POLICY IF EXISTS "Permitir leitura de linhas para autenticados" ON public.linhas_rurais;
DROP POLICY IF EXISTS "Permitir modificação apenas para administradores e secretaria" ON public.linhas_rurais;

-- 5. Criar políticas relaxadas (Públicas) para linhas_rurais
CREATE POLICY "Permitir leitura pública de linhas" 
    ON public.linhas_rurais FOR SELECT 
    TO public 
    USING (true);

CREATE POLICY "Permitir modificação pública de linhas" 
    ON public.linhas_rurais FOR ALL 
    TO public 
    USING (true)
    WITH CHECK (true);
