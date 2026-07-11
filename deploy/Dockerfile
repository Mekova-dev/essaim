# deploy/Dockerfile — image essaim-runner
# Build : docker build --build-arg ESSAIM_REF=<sha|tag> -t ghcr.io/mekova-dev/essaim-runner:<tag> deploy/
ARG ESSAIM_REF=main

FROM node:22-slim AS build
ARG ESSAIM_REF
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /out && git clone https://github.com/swoofer/essaim.git /src && cd /src && git checkout "${ESSAIM_REF}" \
 && npm ci && npm run build && npm pack --pack-destination /out

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl jq \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
COPY --from=build /out/essaim-*.tgz /tmp/
RUN npm install -g /tmp/essaim-*.tgz && rm /tmp/essaim-*.tgz && essaim --version
RUN useradd -m -u 1001 runner
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
USER runner
WORKDIR /home/runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
