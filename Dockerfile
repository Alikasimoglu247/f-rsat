FROM node:24-bookworm
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run db:generate && npm run build && mkdir -p /var/lib/firsatradar/tokens && chown node:node /var/lib/firsatradar/tokens && chmod 0700 /var/lib/firsatradar/tokens
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
