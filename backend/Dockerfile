FROM node:22-alpine

# Criar o diretório da aplicação
WORKDIR /usr/src/app

# Copiar os arquivos de manifesto de dependências primeiro (otimização de cache Docker)
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production

# Copiar todo o resto do código
COPY . .

# Expor a porta 3000 (mesmo que seja mapeada externamente para 4000)
EXPOSE 3000

# Variável de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Iniciar o servidor Express
CMD [ "npm", "start" ]
