# Portable headless executor. No sandbox node, inbound HTTP API or owner key.
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/proofwork-venv && /opt/proofwork-venv/bin/pip install --no-cache-dir -r requirements.txt
# rpc_bridge resolves the minimal pinned NEAR client from this path.
COPY executor/package.json executor/package-lock.json /app/contract/
RUN cd /app/contract && npm ci --omit=dev
COPY executor /app/executor
COPY app/worker_crypto.py app/near_ai_client.py app/company_intelligence.py app/onchain_ai.py app/model_schema.py app/cloud_media_client.py /app/app/
COPY qa/runner.py /app/qa/runner.py
ENV PATH="/opt/proofwork-venv/bin:$PATH" PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "-m", "executor.main"]
CMD ["--help"]
