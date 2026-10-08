FROM node:24-bookworm
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
# build_ca is an optional trusted public CA bundle for managed egress proxies.
RUN --mount=type=secret,id=build_ca,mode=0444 if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci --no-audit --no-fund && chown -R node:node /app && mkdir -p /var/lib/firsatradar/tokens && chown node:node /var/lib/firsatradar/tokens && chmod 0700 /var/lib/firsatradar/tokens
COPY --chown=node:node . .
USER node
RUN --mount=type=secret,id=build_ca,mode=0444 if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run db:generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
