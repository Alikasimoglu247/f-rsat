# Docker Official Image, identical digest on Docker Hub and AWS ECR Public.
# Pinning preserves the reviewed base instead of relying on a mutable tag.
FROM public.ecr.aws/docker/library/node:24-bookworm@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0
# The research worker extracts only cited economic facts from TCMB PDFs.
# Keep TLS verification on; the optional proxy CA exists only during this RUN.
RUN --mount=type=secret,id=build_ca,mode=0444 set -eu; \
    if [ -f /run/secrets/build_ca ]; then printf 'Acquire::https::CaInfo "/run/secrets/build_ca";\n' > /etc/apt/apt.conf.d/99-build-ca; fi; \
    apt-get update && apt-get install --no-install-recommends -y poppler-utils && \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99-build-ca
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
