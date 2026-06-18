# Plataforma Preditiva de Trafegabilidade 🚜🌧️

**Inteligência de Dados para Prevenção de Bloqueios em Estradas Vicinais**

* **Desafio**: Garantir o escoamento logístico da produção agropecuária e aquícola em Ariquemes/RO durante o inverno amazônico, mitigando o isolamento de produtores devido à intransitabilidade de linhas rurais (ex: C-65, C-70).
* **Proponente**: QUANYX TECNOLOGIA

---

## 🎯 Visão do Produto (MVP)

A plataforma transforma a gestão de infraestrutura rural de reativa para proativa. Ao invés de agir apenas quando um caminhão atola, o sistema prevê pontos de colapso logístico cruzando dados meteorológicos com históricos de vulnerabilidade das vias, permitindo manutenção preventiva e rotas alternativas seguras para produtores e transportadores.

A solução é composta por três frentes de atuação:
1. **Aplicativo de Campo (Mobile)**: Funciona Offline-First. Permite aos motoristas registrarem buracos, erosões ou atolamentos via GPS, mesmo sem sinal de internet, sincronizando quando chegam à cidade.
2. **Motor Preditivo (Node.js)**: Consome dados de previsão de chuvas e atualiza automaticamente o status das vias.
3. **Centro de Comando (Web)**: Um painel em tempo real para a Secretaria de Obras gerenciar as rotas, focando os recursos de manutenção onde o colapso é iminente.

---

## 🏗️ Arquitetura de Software

A arquitetura foi desenhada para o contexto de Hackathon: ágil de implementar, tolerante a falhas de rede e focada em tecnologias modernas de alta produtividade.

### Tech Stack
* **Banco de Dados & BaaS**: Supabase (Self-hosted via Docker). Utilizando PostgreSQL com PostGIS para inteligência geoespacial e Realtime nativo para notificações.
* **Serviços e API**: Node.js + Express.
* **Frontend (Centro de Comando)**: HTML/JS puro + Leaflet.js (Mapas interativos sem custo).
* **Aplicativo Móvel**: Flutter (ou FlutterFlow) focado em persistência local (SQLite/Hive).

### Fluxo de Dados e Sincronização (O Core da Solução)
1. **Campo (Offline)**: O produtor registra o incidente (GPS + Tipo). O dado é persistido localmente no celular.
2. **Sincronização em Lote**: Ao encontrar rede (Wi-Fi/4G), o App dispara um payload JSON em batch para o servidor central.
3. **Processamento**: O backend (Node.js) recebe, formata geometricamente usando PostGIS e faz upsert no Supabase.
4. **Tempo Real**: O Supabase emite um evento via WebSocket para o Centro de Comando, atualizando o mapa sem refresh da tela.

---

## 🗺️ Modelo de Dados (Supabase/PostGIS)

O modelo relacional suporta a inteligência geográfica e o estado de risco.

### Principais Entidades:
* **linhas_rurais** (As Estradas)
  * `id` (PK)
  * `nome` (ex: Linha C-65)
  * `status_trafego` (Livre, Atenção, Bloqueado)
  * `indice_risco_atual` (Calculado pelo Motor Preditivo)
* **reportes_vias** (Os Incidentes vindos do Campo)
  * `id` (UUID, PK)
  * `usuario_id` (Auth UUID)
  * `tipo_problema` (Atolamento, Erosão, Bueiro, Ponte)
  * `latitude` / `longitude`
  * `geom` (GEOMETRY Point, SRID 4326 - Para cálculos PostGIS)
  * `criado_no_dispositivo` (Timestamp original do incidente offline)
* **dispositivos_rastreio** (Telemetria/GPS Opcional)
  * `id`, `veiculo`, `latitude`, `longitude`, `velocidade`

---

## ⚙️ Motor Preditivo (A Regra de Negócio)

O cálculo de vulnerabilidade é executado via Cron Job no Node.js, atualizando o banco periodicamente.
O algoritmo simplificado do MVP utiliza uma Matriz de Risco Ponderada:

**Fórmula de Índice de Vulnerabilidade da Via (IVV)**:
$$\text{IVV} = (\text{Peso\_Chuva} \times \text{Volume\_Milimetros\_Previstos}) + (\text{Peso\_Solo} \times \text{Fragilidade\_Historica})$$

Se o IVV de um segmento da C-65 ultrapassar o limiar de segurança, a linha muda automaticamente para status 'Alerta Vermelho' no sistema.

---

## 🚀 Roteiro de Implementação (Roadmap do Hackathon)

O projeto será desenvolvido localmente (Ubuntu 24.04) seguindo estas fases:

### Fase 1: Infraestrutura de Dados (Docker)
- [ ] Levantar serviços do Supabase via docker-compose.
- [ ] Executar Migrations no Supabase Studio para criação das tabelas e habilitação do PostGIS.
- [ ] Configurar permissões de Realtime nas tabelas operacionais.

### Fase 2: Backend Core (Node.js)
- [ ] Inicializar projeto Express.
- [ ] Configurar conexão Supabase Service Role.
- [ ] Criar endpoint de sincronização offline-to-online (`POST /api/v1/sync`).

### Fase 3: Inteligência e Integrações
- [ ] Integrar serviço de meteorologia (OpenWeather/INMET).
- [ ] Criar Cron Job no Node.js para rodar a Engine Preditiva.

### Fase 4: Centro de Comando (Web Dashboard)
- [ ] Construir interface estática servida pelo Express.
- [ ] Integrar Leaflet.js renderizando as linhas de Ariquemes.
- [ ] Implementar escuta de WebSockets via Supabase-js para plotagem de pontos em tempo real.

### Fase 5: Dispositivo Móvel (Flutter)
- [ ] Implementar captura de GPS e câmera.
- [ ] Lógica de fila de mensagens locais (armazenamento de estado offline).
- [ ] Disparo automatizado em lote quando conexão detectada.