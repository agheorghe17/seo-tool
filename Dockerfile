# Runtime image for apps/api + apps/worker (both run TS directly via tsx — `start` scripts).
# One image, two commands (see docker-compose.yml). No compile step: `build` is only `tsc --noEmit`.
FROM node:22-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production
RUN corepack enable

WORKDIR /app

# Install once; the VM rebuilds rarely so layer granularity isn't worth the monorepo hassle.
COPY . .
RUN pnpm install --frozen-lockfile --prod=false

# Overridden per service in docker-compose.yml.
EXPOSE 3001
CMD ["pnpm", "--filter", "api", "start"]
