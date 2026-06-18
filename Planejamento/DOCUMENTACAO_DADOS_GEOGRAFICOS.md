# Metodologia de Obtenção e Tratamento de Dados Geográficos

## Introdução
Para garantir a precisão espacial e o valor real da aplicação de Monitoramento de Trafegabilidade Rural, utilizamos dados geográficos oficiais do Governo (CENSIPAM/SIPAM) combinados com dados da comunidade (OpenStreetMap). Esta documentação descreve as fontes públicas utilizadas, como os dados foram filtrados para o município de Ariquemes/RO e a forma como foram convertidos e incorporados ao nosso banco de dados.

## 📂 Fontes de Dados Utilizadas

### 1. CENSIPAM/SIPAM (Fonte Oficial Principal - 2019)
A principal fonte de dados vetoriais das estradas rurais (linhas) e obras de arte (pontes, galerias e bueiros) é o levantamento **"Malha Viária do Estado de Rondônia 2019"** do Centro Gestor e Operacional do Sistema de Proteção da Amazônia (CENSIPAM).
- **Escala e Precisão:** Escala 1:25.000, rastreado com GPS de navegação em campo (precisão esperada melhor que 5 metros).
- **Sistema de Referência Geodésica:** SIRGAS 2000 / EPSG:4674.

**Camadas Utilizadas via WFS:**

| Camada | Descrição | Link WFS (Endpoint) |
|---|---|---|
| `publico:trecho_rodoviario_edgv` | Trechos Rodoviários e Vias de Terra | [🔗 WFS Estradas](https://panorama.sipam.gov.br/geoserver/publico/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=publico:trecho_rodoviario_edgv&outputFormat=application/json) |
| `publico:ponte` | Pontes, Galerias e Bueiros | [🔗 WFS Pontes](https://panorama.sipam.gov.br/geoserver/publico/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=publico:ponte&outputFormat=application/json) |

### 2. Base SIPAM - Malha Viária Município de Ariquemes (2008)
Utilizada especificamente para validar e resgatar os **nomes tradicionais das linhas rurais** do município, uma vez que estas são a principal referência de navegação para a população local (ex: LH C-05, C-10, C-45, C-65, etc).
- **Formatos Nativos:** [ariquemes.zip](https://panorama.sipam.gov.br/geonetwork/srv/api/records/e11d6ae7-3a36-4069-a1cd-97d100e933b2/attachments/ariquemes.zip), [rodov_mun_npav.kmz](https://panorama.sipam.gov.br/geonetwork/srv/api/records/e11d6ae7-3a36-4069-a1cd-97d100e933b2/attachments/rodov_mun_npav.kmz) e [rodov_mun_pav.kmz](https://panorama.sipam.gov.br/geonetwork/srv/api/records/e11d6ae7-3a36-4069-a1cd-97d100e933b2/attachments/rodov_mun_pav.kmz).
- **Sistema de Referência Original:** SAD69.

### 3. OpenStreetMap (OSM) / Overpass API (Fonte Auxiliar)
Utilizada para validação do traçado atual e conferência da malha viária mapeada pela comunidade global, garantindo a detecção de novos traçados ou correções de nomes recentes. Pode ser consultada via [Overpass Turbo](https://overpass-turbo.eu/).

---

## 🛠️ Processo de Tratamento e Conversão

### Passo 1: Extração via API OGC WFS
Os dados brutos foram extraídos diretamente dos servidores do SIPAM. Para viabilizar a ingestão na Web, os dados em formato nativo foram solicitados diretamente como **GeoJSON** através de parâmetros da URL WFS (`outputFormat=application/json`):

**Comando de Extração Direta:**
```bash
curl -L -o estradas_ro.geojson \
"https://panorama.sipam.gov.br/geoserver/publico/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=publico:trecho_rodoviario_edgv&outputFormat=application/json"
```

**Exemplo de Formato GeoJSON Extraído:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-63.0408, -9.9133],
          [-63.0410, -9.9140]
        ]
      },
      "properties": {
        "nome": "Linha C 45",
        "jurisdicao": "Municipal",
        "revestimento": "Terra"
      }
    }
  ]
}
```

### Passo 2: Processamento Geoespacial (QGIS / Ferramentas SIG)
Como os dados obtidos englobam a totalidade do estado de Rondônia, uma rotina de tratamento espacial foi aplicada:
1. **Recorte (Clip Spatial):** A malha viária estadual e os pontos críticos (pontes/bueiros) foram recortados utilizando o polígono oficial do limite municipal de **Ariquemes (IBGE)**.
2. **Reprojeção (Datum):** Todos os dados vetoriais originários do SIRGAS 2000 ou SAD69 foram matematicamente reprojetados para **EPSG:4326 (WGS84)**, o qual é o padrão universal necessário para renderização de polígonos em bibliotecas de frontend (Leaflet.js na Web e Flutter Map no Mobile).
3. **Cruzamento de Feições:** As feições do tipo `Ponto` (pontes) foram cruzadas geograficamente com as `Linhas` (estradas), permitindo criar um relacionamento relacional e mapear exatamente em qual via cada obra de arte se encontra.

### Passo 3: Ingestão no Banco de Dados da Aplicação
Os arquivos GeoJSON gerados foram injetados em nosso banco de dados PostgreSQL habilitado com a extensão **PostGIS** (Supabase).

**Esquema de Armazenamento:**
| Campo | Tipo no Banco | Descrição |
|---|---|---|
| `geom` | `Geometry(LineString, 4326)` | Geometria nativa da estrada para cálculos espaciais |
| `nome` | `String` | Nome validado das linhas rurais (ex: Linha C 65) |
| `jurisdicao` | `String` | Jurisdição da via (Estadual, Municipal, Federal) |
| `pavimentada` | `Boolean` | Derivado da diferenciação "pav / npav" do SIPAM |

---

## Desafios Resolvidos pelo Software (Mitigação de Defasagem)

**O Problema de Dados Geográficos Rurais:**
Conforme a própria natureza da infraestrutura amazônica, obras de arte e estradas de terra mudam constantemente. Uma ponte de madeira mapeada pelo CENSIPAM em 2019 pode ter sido levada pelas águas, substituída por galeria pluvial ou reformada em concreto (ex: ponte sobre o Rio Jamari ou substituição em galerias na C-65). Da mesma forma, erosões severas não são perenes e aparecem a cada estação chuvosa.

**A Solução Inteligente do Aplicativo:**
O software foi desenhado para **complementar** a defasagem temporal natural destas bases geográficas governamentais estáticas. 

No sistema, os dados do SIPAM e CENSIPAM atuam de forma estrutural, criando um **mapa base de alta fidelidade**. Sobre este mapa base, foi implementada a filosofia de ***Crowdsourcing*** e Inteligência em Tempo Real (WebSockets): 
1. **Atualização Viva:** Produtores, motoristas e gestores do DER utilizam os smartphones para registrar ocorrências atuais (ponte caída, alagamento, buraco). 
2. **Correção Contínua:** Isso transforma o mapa estático de 2019 em um mapa vivo, dinâmico e focado em trafegabilidade instantânea, servindo não apenas como um observatório de infraestrutura, mas como uma ferramenta emergencial inteligente.

---

## 🗺️ Arquitetura de Visualização e Renderização

### 1. Armazenamento e Bancos de Dados
As coordenadas não ficam soltas no código-fonte. Todo o conteúdo geográfico é salvo e consultado via nuvem:
- **Tabela `linhas_rurais`**: Armazena as vias (estradas). Usa o formato nativo do PostGIS (`Geometry(LineString, 4326)`) para permitir cálculos de distância no futuro.
- **Tabela `reportes_incidentes`**: Armazena os problemas (pontos críticos) reportados na via usando Latitude/Longitude atrelada ao ID da linha mais próxima.

### 2. Motor de Mapas Utilizado
O ecossistema utiliza renderizadores baseados em **OpenStreetMap (OSM)** como camada de mapa-base estático (os "ladrilhos" ou *tiles* de fundo que mostram relevo, rios e propriedades):
- **Web (Dashboard Dashboard):** Construído sobre **Leaflet.js**, uma biblioteca JavaScript levíssima de código aberto. O mapa-base provém de provedores OSM/MapTiler.
- **Mobile (Aplicativo Flutter):** Utiliza o pacote **`flutter_map`**, o equivalente ao Leaflet para Flutter, projetando o mapa por meio de Canvas e puxando os mesmos TileServers de mapa-base em um provedor online de mapas de satélite/ruas.

### 3. Lógica de Desenho e Interatividade (Frontend)
Em vez de exportarmos imagens pré-renderizadas, o sistema faz a "pintura" de todas as linhas e ícones ao vivo em tempo de execução (*Client-Side Rendering*).

**No Painel Web (Leaflet):**
1. O Javascript puxa os dados do banco que vêm no formato exato de `GeoJSON`.
2. A função `L.geoJSON()` desenha instantaneamente os pontos do GeoJSON na tela, sobrepondo as estradas em cima do mapa do OpenStreetMap.
3. A cor de cada linha é decidida dinamicamente lendo o atributo `status_trafego` e `indice_risco` no momento do desenho.

**No Aplicativo Mobile (Flutter):**
1. O Flutter busca no banco Supabase as coordenadas e as transforma em uma lista da classe `LatLng`.
2. O componente `PolylineLayer` pinta os vetores da estrada por cima do mapa-base como se fossem riscos em um quadro em branco.
3. **Interatividade Complexa:** Como as linhas pintadas em canvas no Flutter não têm um evento nativo de "clique", implementamos um algoritmo matemático de **Distância Ponto a Segmento** (`_distanceToSegment`). Quando o usuário toca na tela, a matemática calcula se a distância Euclidiana entre o dedo do usuário e os vetores das estradas é menor que ~150 metros. Se for, o App detecta qual rua foi tocada e exibe os dados para alteração do status.
