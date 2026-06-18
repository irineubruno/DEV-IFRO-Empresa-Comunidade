# Arquitetura e Tecnologias do Sistema 🚀

Bem-vindo à documentação técnica do aplicativo **Trafegabilidade Rural**. Este documento foi criado para ajudar desenvolvedores e avaliadores a entenderem de forma clara e intuitiva o *stack* tecnológico utilizado, como as peças se comunicam e qual a responsabilidade de cada componente no nosso ecossistema.

O nosso sistema foi desenhado sob a premissa de **alta disponibilidade**, **sincronização em tempo real** e **suporte a redes instáveis** (offline-first para zonas rurais).

---

## 🏗️ Visão Geral da Arquitetura

O ecossistema é dividido em 4 pilares principais:
1. **Banco de Dados & BaaS (Backend-as-a-Service)**
2. **Backend Engine (Node.js)**
3. **Dashboard Web (Frontend de Gestão)**
4. **Aplicativo Mobile (Ferramenta de Campo)**

Abaixo explicamos o que roda em cada um deles:

---

## 1. Banco de Dados e Serviços Cloud (Supabase)
Escolhemos o **Supabase** como a espinha dorsal de dados da nossa aplicação, que é uma alternativa Open-Source ao Firebase construída sobre o poderoso banco relacional PostgreSQL.

| Tecnologia | Função no Sistema |
|---|---|
| **PostgreSQL** | Banco de dados central hiper-escalável. |
| **PostGIS** | Extensão oficial do PostgreSQL utilizada para armazenar geometrias complexas (mapas, rotas, rios) e realizar cálculos espaciais ultra-rápidos (descobrir o ponto mais próximo, por exemplo). |
| **Supabase Realtime** | Tecnologia de WebSockets integrada. Permite que o celular avise instantaneamente o Painel Web quando um carro atolar, mudando as cores do mapa ao vivo sem precisar dar *Refresh* na página. |
| **Supabase Auth** | Gerenciamento de Identidade, criptografia de senhas e Tokens de acesso (JWT) seguros para motoristas e gestores. |

---

## 2. Backend Engine (Node.js & Express)
O cérebro operacional e as integrações de Inteligência Artificial ficam escondidos com segurança no nosso servidor.

- **Framework Principal:** Utilizamos **Node.js** com o framework **Express.js**. O Express foi escolhido por ser levíssimo, ágil e excelente para a construção rápida de APIs REST.
- **Padrão de Arquitetura (MVC Adaptado):** O backend foi totalmente estruturado em um modelo **Model-View-Controller (MVC)** voltado para serviços:
  - **M (Model):** O Supabase (PostgreSQL) assume o papel de camada de Dados/Modelos, garantindo integridade e cálculos geográficos.
  - **V (View):** As "Visualizações" foram desacopladas em dois clientes: A pasta estática `/public` servindo os arquivos HTML/JS do Dashboard Web, e o Aplicativo Mobile Flutter de forma autônoma.
  - **C (Controller) & Services:** A pasta `src/controllers` contém os Controladores (ex: `areasController.js`, `syncController.js`) que processam as requisições (requests). Adicionamos também uma camada de **Services** (`src/services`) para separar as regras de negócio puras e pesadas dos Controladores.
- **Integração Meteorológica (Open-Meteo API):** Para prever as chuvas, o backend consome dados reais da **Open-Meteo API** (`api.open-meteo.com`). Escolhemos essa API por ser totalmente aberta (Open-Source), não exigir chaves comerciais para uso não-comercial, e ter uma altíssima precisão com modelos climáticos globais. O nosso sistema busca a propriedade `precipitation_sum` passando exatamente as coordenadas (Latitude e Longitude) do município de Ariquemes.
- **Motor Preditivo e Automação (Service Layer):** Dentro da camada de serviços do Backend, roda o `predictiveEngine.js`. Este processo agendado coleta a chuva prevista (em mm) do Open-Meteo e os envia para uma função inteligente (RPC) dentro do banco de dados. Um algoritmo matemático cruza essa volumetria de chuva com o histórico de incidentes para calcular o "Índice de Risco" (0.0 a 10.0) de intransitabilidade das vias rurais.
- **Uso de Inteligência Artificial:** No momento, a aplicação não roda "IA Generativa" (LLM) em tempo real nas análises. O uso de IA foi estratégico e limitado apenas à fase de engenharia e conversão do enorme volume de dados geográficos, permitindo limpar e estruturar o banco de dados base do SIPAM rapidamente.
- **Comunicação:** O Backend expõe rotas HTTP seguras (ex: `/api/linhas-rurais`, `/api/incidentes`) via os Controllers para alimentar o Dashboard Web e os serviços externos.

---

## 3. Painel Web de Gestão (HTML/CSS/JS)
O painel administrativo, voltado para as Secretarias de Obras, Prefeituras e gestores logísticos. Focamos em performance crua e carregamento instantâneo.

- **Vanilla Stack:** Optamos por **NÃO** usar frameworks pesados (como React ou Angular). A Web foi construída em puro **HTML5, CSS3 e Vanilla JavaScript**. Isso garante que a página carregue em milissegundos em qualquer computador da administração pública.
- **Mapas:** Utilizamos a biblioteca open-source **Leaflet.js** conectada aos *tiles* do OpenStreetMap para desenhar de forma leve os mapas rurais na tela do computador.
- **Estilização:** Sistema de cores responsivo (suporte a Dark Mode), painéis translúcidos (Glassmorphism) e ícones vetorizados via biblioteca **Lucide Icons**.

---

## 4. Aplicativo Mobile (Flutter)
A ferramenta que vai para o meio do mato, nas mãos de produtores, motoristas de caminhão e fiscais, onde a internet muitas vezes não chega.

- **Framework Principal:** Desenvolvido em **Flutter** (Linguagem **Dart**), o framework do Google que permite compilar o aplicativo de forma nativa para Android e iOS usando o mesmo código.
- **Mapas Canvas:** Substituímos o Google Maps nativo pelo **`flutter_map`**. Essa biblioteca desenha os vetores diretamente na GPU (Canvas), permitindo carregar o gigantesco mapa do OpenStreetMap offline e sem consumir cotas de API.
- **Offline-First (SQFlite):** No meio de uma estrada sem sinal 4G/3G, se um motorista tentar reportar uma "Ponte Caída", o Flutter salva os dados num mini-banco de dados interno no aparelho (via `sqflite`). 
- **Sync Background:** Assim que o motorista chega numa vila e o celular reconecta no Wi-Fi, o serviço `SyncService` empurra automaticamente os dados guardados para a Nuvem e limpa a memória do celular.

---

## 🔁 Fluxo de Dados Resumido (O Caminho da Informação)

1. **(No Campo):** Caminhoneiro vê buraco -> Abre App Flutter (Offline) -> Marca no Mapa -> Salva no SQFlite.
2. **(Na Vila):** Celular detecta 4G -> Dispara evento -> `SyncService` sobe dados pro **Supabase**.
3. **(Na Nuvem):** O banco **PostgreSQL** salva. O **Supabase Realtime** grita pelos WebSockets: *"Novo dado em Ariquemes!"*
4. **(Na Prefeitura):** O Painel Web, conectado via **Vanilla JS**, recebe o grito do WebSocket e instantaneamente pinta o buraco no **Leaflet.js** para o Secretário de Obras enviar uma máquina.
5. **(No Servidor):** Durante a noite, o **Node Express** roda o Algoritmo Preditivo (coletando chuvas via Open-Meteo). A função matemática do banco cruza as chuvas com o buraco não resolvido, e sobe o Índice de Risco daquela estrada, mudando a cor dela para vermelho no mapa de todos no dia seguinte.
