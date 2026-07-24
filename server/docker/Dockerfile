FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY app/package.json app/package.json
COPY server/package.json server/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/react/package.json packages/react/package.json
COPY packages/electron/package.json packages/electron/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/skills/package.json packages/skills/package.json
COPY examples/web-demo/package.json examples/web-demo/package.json
COPY examples/electron-demo/package.json examples/electron-demo/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm --filter @traceability/server build
RUN pnpm --filter @traceability/server deploy --prod --legacy /runtime

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system traceability && useradd --system --gid traceability --home-dir /app traceability

COPY --from=build --chown=traceability:traceability /runtime ./

USER traceability
EXPOSE 3000

CMD ["node", "dist/index.js"]
