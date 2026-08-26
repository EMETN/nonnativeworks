FROM node:24

ARG CLAUDE_CODE_VERSION=latest

# Install Doppler CLI
RUN curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg && \
  echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | tee /etc/apt/sources.list.d/doppler-cli.list && \
  apt-get update && apt-get install doppler

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  python3 \
  python3-pip \
  python3-venv \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude /home/node/.doppler && \
  chown -R node:node /workspace /home/node/.claude /home/node/.doppler

WORKDIR /workspace

# --- PYTHON SETUP (venv) ---

# Copy dependency manifests first for better caching
COPY ./scraper/requirements.txt ./scraper/pyproject.toml /workspace/

# Create virtual environment outside /workspace so the bind mount doesn't shadow it
RUN python3 -m venv /opt/scraper-venv

# Install Python dependencies into venv (runtime deps + dev tooling group: ruff)
RUN --mount=type=cache,target=/root/.cache/pip \
    /opt/scraper-venv/bin/pip install --upgrade pip && \
    /opt/scraper-venv/bin/pip install -r /workspace/requirements.txt && \
    /opt/scraper-venv/bin/pip install --group /workspace/pyproject.toml:dev

# Make venv the default Python
ENV PATH="/opt/scraper-venv/bin:$PATH"

# Deps need root; the browser binary must install as node so it lands in node's
# cache (~/.cache/ms-playwright) where the scraper looks, not root's.
RUN /opt/scraper-venv/bin/playwright install-deps chromium
USER node
RUN /opt/scraper-venv/bin/playwright install chromium
USER root

# --- END PYTHON SETUP ---

ARG GIT_DELTA_VERSION=0.19.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Install pnpm globally
RUN npm install -g pnpm

# Verify pnpm installation
RUN pnpm -v

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.1
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# (Optional) auto-activate venv in terminal
RUN echo 'source /opt/scraper-venv/bin/activate' >> /home/node/.zshrc

# Install Claude (global tool, uses npm intentionally)
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# --- Browser setup for MCP servers (Node Playwright + Chrome DevTools) ---
# Bakes browsers into the image so both MCP servers survive container rebuilds.
# Browsers are installed via the exact Playwright bundled inside @playwright/mcp,
# so their revisions always match the MCP that runs them (bump by rebuilding).

# System libraries for Chromium, Firefox and WebKit (needs root/apt)
USER root
RUN npx -y -p @playwright/mcp@latest playwright install-deps chromium firefox webkit && \
  rm -rf /root/.npm /root/.cache/ms-playwright
USER node

# Browser binaries for the Playwright MCP, into node's cache
RUN npx -y -p @playwright/mcp@latest playwright install chromium firefox webkit

# chrome-devtools-mcp shares the Playwright Chromium via a resolver shim placed at
# the executablePath its plugin hardcodes (.../chromium-arm64/chrome-linux/chrome).
# The shim resolves the newest installed chromium-<rev> at launch and exec's it, so
# a future browser upgrade (new revision dir) can never orphan it. exec replaces the
# process image, so Chromium still finds its own resources next to the real binary.
RUN mkdir -p /home/node/.cache/chrome-devtools-mcp/chromium-arm64/chrome-linux && \
  printf '%s\n' \
    '#!/bin/sh' \
    'bin=$(ls -d /home/node/.cache/ms-playwright/chromium-[0-9]*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1)' \
    '[ -x "$bin" ] || { echo "no Playwright chromium found under ~/.cache/ms-playwright" >&2; exit 1; }' \
    'exec "$bin" "$@"' \
    > /home/node/.cache/chrome-devtools-mcp/chromium-arm64/chrome-linux/chrome && \
  chmod +x /home/node/.cache/chrome-devtools-mcp/chromium-arm64/chrome-linux/chrome

# Copy and set up firewall script
COPY .devcontainer/init-firewall.sh /usr/local/bin/
USER root
COPY scripts/firewall.sh /usr/local/bin/firewall
RUN chmod +x /usr/local/bin/init-firewall.sh /usr/local/bin/firewall && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh, /usr/local/bin/firewall" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node
