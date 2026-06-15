export async function readResponseArrayBufferLimited(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Response body is too large");
  }

  if (!response.body) {
    const body = await response.arrayBuffer();
    if (body.byteLength > maxBytes) {
      throw new Error("Response body is too large");
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Response body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out.buffer as ArrayBuffer;
}
