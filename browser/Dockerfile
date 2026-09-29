FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium socat ca-certificates fonts-noto-cjk tini curl && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 1000 browser && mkdir -p /profile && chown browser:browser /profile
COPY start.sh /usr/local/bin/start-browser
RUN chmod 755 /usr/local/bin/start-browser
USER browser
ENV HOME=/home/browser
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-browser"]
