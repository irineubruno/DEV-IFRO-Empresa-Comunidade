# Estágio 1: Build do Flutter Web
FROM debian:bookworm-slim AS build-env

# Instalar dependências necessárias
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    xz-utils \
    zip \
    libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*

# Clonar o Flutter SDK (versão estável)
RUN git clone https://github.com/flutter/flutter.git -b stable /usr/local/flutter

# Adicionar o Flutter ao PATH
ENV PATH="/usr/local/flutter/bin:/usr/local/flutter/bin/cache/dart-sdk/bin:${PATH}"

# Executar doctor para pré-carregar binários do Dart/Flutter
RUN flutter doctor -v

# Configurar diretório de trabalho
WORKDIR /app

# Copiar arquivos do projeto mobile
COPY . .

# Habilitar suporte a Web e compilar em modo Release
RUN flutter config --enable-web
RUN flutter pub get
RUN flutter build web --release

# Estágio 2: Servir com Nginx
FROM nginx:alpine

# Copiar os arquivos compilados para a pasta pública do Nginx
COPY --from=build-env /app/build/web /usr/share/nginx/html

# Expor a porta padrão do container
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
