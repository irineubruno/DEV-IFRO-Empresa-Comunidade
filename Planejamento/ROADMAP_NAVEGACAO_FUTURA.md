# Roadmap de Futuras Implementações: Sistema de Navegação (GPS) 🧭

Este documento serve como guia arquitetural para desenvolvedores futuros que forem evoluir o aplicativo **Trafegabilidade Rural** para incluir funcionalidades de navegação passo a passo (turn-by-turn), convertendo a ferramenta atual em um autêntico "Waze das Estradas Rurais".

Para garantir um desenvolvimento ágil e viável, o projeto foi dividido em 3 fases evolutivas de complexidade:

---

## 🚀 Fase 1: Navegação Visual Básica (MVP de Guia)
O objetivo desta fase é permitir que o produtor rural/motorista abra o aplicativo e consiga ver seu veículo se movendo em tempo real sobre a linha azul traçada no mapa, mantendo o usuário centrado na tela.

**Complexidade Estimada:** Baixa/Média (1 a 2 Sprints)

### O que precisa ser desenvolvido no Flutter:
1. **Streaming de Geolocalização:** 
   - Substituir a chamada simples `Geolocator.getCurrentPosition()` por `Geolocator.getPositionStream()`. Isso permitirá escutar o movimento do usuário a cada segundo.
2. **Marcador de Posição Dinâmico:**
   - Adicionar a biblioteca `flutter_map_location_marker`. Ela desenha automaticamente a "seta azul do GPS" no mapa e anima a movimentação de forma fluida a 60 FPS, interpolando os pulos do sinal do GPS.
3. **Câmera Seguidora (Camera Tracking):**
   - Implementar um botão "Modo Direção".
   - Quando ativado, o aplicativo deve pegar o `MapController` do `flutter_map` e atualizar o `center` da câmera e o `rotation` (para apontar o mapa na direção para onde o veículo está indo - *heading*).

---

## 🛰️ Fase 2: Navegação Turn-by-Turn (Padrão Waze)
Fase dedicada à automação comercial. Em vez de apenas "seguir a linha", o aplicativo precisa calcular recálculos inteligentes se o usuário errar o caminho e ditar instruções de voz ("vire à direita").

**Complexidade Estimada:** Alta

### Alternativas de Arquitetura:
Fazer o cálculo espacial do zero em Flutter é contraproducente. É altamente recomendado utilizar bibliotecas dedicadas:
1. **Alternativa A (Recomendada): Mapbox Navigation SDK**
   - Implementar SDKs nativos (`mapbox_navigation_flutter`).
   - Ele entrega uma tela 3D inclinada padrão Waze/Google Maps.
   - Já vem com setas indicativas de "Curve à Direita/Esquerda" renderizadas na tela.
   - Vem com serviço *TTS (Text-to-Speech)* para ditar as rotas.
2. **Alternativa B: OSRM Avançado + Flutter TTS**
   - Caso queira evitar o pagamento de cotas do Mapbox.
   - Consultar a propriedade `steps` (Route Steps) na nossa atual chamada do OSRM. 
   - Traduzir os `steps` ("turn-right") para português.
   - Usar a biblioteca `flutter_tts` para o celular ler os passos em voz alta quando o usuário se aproximar da coordenada (medindo a distância usando matemática Haversine).

---

## 📴 Fase 3: Navegação 100% Offline
A etapa máxima (Holy Grail) para infraestrutura rural na Amazônia, visto que a conexão 3G/4G é escassa fora dos eixos de rodovias federais.

**Complexidade Estimada:** Extrema

### Como Implementar:
1. **Motor de Rotas Local:** O OSRM que roda hoje em nosso servidor Node precisaria rodar **dentro do aparelho celular** do produtor. 
2. **Bibliotecas Valhalla / GraphHopper:** Será necessário integrar motores de roteamento offline compilados em C++ (Valhalla) via JNI/CGO (Platform Channels do Flutter).
3. **Download de Mapas:** Criar uma tela no App onde o usuário baixa o arquivo `.pbf` (Protocolbuffer Binary Format) do OpenStreetMap do Estado de Rondônia no Wi-Fi de casa, para que o motor de rotas consiga traçar caminhos (recalcular rotas) sem internet alguma no meio do trajeto.

---

> [!NOTE]
> **Recomendação de Próximo Passo Técnico:** Caso a equipe decida iniciar essa esteira, comece isolando a Fase 1. Modifique a tela `MapScreen` adicionando um `StreamBuilder` e um `FloatingActionButton` com o ícone de bússola para centralizar o mapa, usando a estrutura já criada no `route_service.dart`.
