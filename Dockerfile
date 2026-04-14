# syntax=docker/dockerfile:1.7

# ==============================================================================
# base: dev と runner で共有する最小ランタイム
# ==============================================================================
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production

# better-sqlite3 のランタイム依存 (libstdc++ は bookworm-slim に同梱)
# tini は PID 1 シグナル処理用
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# ==============================================================================
# deps: 本番依存のみを native build 含めて解決
# ==============================================================================
FROM base AS deps

# better-sqlite3 を Linux バイナリでビルドするためのツールチェイン
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ==============================================================================
# builder: 全依存 + ソース + Next.js ビルド
# ==============================================================================
FROM base AS builder

# ビルド時はdevDependencies (Tailwind, TypeScript等) も必要
ENV NODE_ENV=development

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# スクリプト類のTypeScriptビルドのみ (Next.jsはrunnerでdev modeで起動)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build:scripts

# ==============================================================================
# runner: 本番イメージ (Proxmox デプロイ対象)
# Next.js 16のprerender bugを回避するため、dev modeで起動する
# ==============================================================================
FROM base AS runner

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/yomu.db
ENV MIGRATIONS_DIR=/app/drizzle

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# ソースと全依存 (dev含む) をコピー
COPY --from=builder --chown=node:node /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/tsconfig.json /app/next.config.ts /app/postcss.config.mjs /app/drizzle.config.ts ./

# マイグレーション / stale-reset 用スクリプト
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/entrypoint.sh ./entrypoint.sh

RUN mkdir -p /data && chown node:node /data && chmod +x ./entrypoint.sh
VOLUME ["/data"]

USER node
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]

# ==============================================================================
# dev: devcontainer が使う開発環境
# ==============================================================================
FROM base AS dev

ENV NODE_ENV=development
ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

ARG TZ=Asia/Tokyo
ENV TZ=$TZ

# 開発ツール + better-sqlite3 ビルドツール + firewall 用
RUN apt-get update && apt-get install -y --no-install-recommends \
    less git procps sudo fzf zsh man-db unzip gnupg2 gh \
    iptables ipset iproute2 dnsutils aggregate jq \
    nano vim wget curl \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# git-delta (optional — ビルド失敗してもスキップ)
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
    wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" \
    || echo "git-delta install skipped"

# npm global と Claude config 用ディレクトリ
RUN mkdir -p /usr/local/share/npm-global /home/node/.claude /commandhistory /app/node_modules && \
    touch /commandhistory/.bash_history && \
    chown -R node:node /usr/local/share/npm-global /home/node/.claude /commandhistory /app

# firewall スクリプト (Claude Code 用ネットワーク分離)
COPY .devcontainer/init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh && \
    echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
    chmod 0440 /etc/sudoers.d/node-firewall

USER node

# zsh + powerlevel10k
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
    -p git \
    -p fzf \
    -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
    -a "source /usr/share/doc/fzf/examples/completion.zsh" \
    -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    -x

# Claude Code CLI
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

WORKDIR /app

# devcontainer は volume mount されたソースを使うので CMD は常駐のみ
CMD ["sleep", "infinity"]
