# deploy/Dockerfile — image essaim-runner
# Build : docker build --build-arg ESSAIM_REF=<sha|tag> --build-arg CATALOG_REF=<sha> \
#         --secret id=catalog_token,env=CATALOG_TOKEN -t ghcr.io/mekova-dev/essaim-runner:<tag> deploy/
ARG ESSAIM_REF=main
ARG CATALOG_REF=main

# ── essaim (moteur GÉNÉRIQUE, catalogue générique) ────────────────────────────
FROM node:22-slim AS build
ARG ESSAIM_REF
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /out && git clone https://github.com/swoofer/essaim.git /src && cd /src && git checkout "${ESSAIM_REF}" \
 && npm ci && npm run build && npm pack --pack-destination /out

# ── catalogue MEKOVA (le domaine : découverte, prototype, implement, review) ───
# Le repo est PRIVÉ : le clone passe par un secret BuildKit, jamais par un ARG ni
# une ENV — un ARG resterait lisible dans l'historique des layers de l'image.
# Le sha est pinné (CATALOG_REF) exactement comme ESSAIM_REF : une image
# reproductible sur le moteur mais flottante sur les prompts serait le pire des
# deux mondes pour déboguer un raid qui déraille.
FROM node:22-slim AS catalog
ARG CATALOG_REF
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=catalog_token \
    git clone "https://x-access-token:$(cat /run/secrets/catalog_token)@github.com/Mekova-dev/mekova-shared-config.git" /shared \
 && cd /shared && git checkout "${CATALOG_REF}" \
 && test -d essaim-catalog/presets || { echo "essaim-catalog/ absent du catalogue Mekova" >&2; exit 1; } \
 && mkdir -p /out && cp -r essaim-catalog /out/mekova-catalog \
 && rm -rf /shared   # ne jamais laisser le clone (et son remote authentifié) dans un layer

# ── image finale ──────────────────────────────────────────────────────────────
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl jq \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
COPY --from=build /out/essaim-*.tgz /tmp/
RUN npm install -g /tmp/essaim-*.tgz && rm /tmp/essaim-*.tgz && essaim --version

# Le catalogue Mekova est un OVERLAY par-dessus le catalogue bundlé d'essaim.
# ESSAIM_CATALOG le fait charger par TOUTES les commandes (run, pipeline, list),
# sans que l'entrypoint ait à passer --catalog partout.
COPY --from=catalog /out/mekova-catalog /opt/mekova-catalog
ENV ESSAIM_CATALOG=/opt/mekova-catalog

RUN useradd -m -u 1001 runner
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
USER runner
WORKDIR /home/runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
