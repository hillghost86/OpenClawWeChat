export function redactUploadApiUrl(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return raw;
  }

  const redactPath = (pathname: string): string => {
    return pathname.replace(/\/bot([^/]+)(\/send\w+)$/i, (_, encodedToken: string, suffix: string) => {
      let decodedToken = encodedToken;
      try {
        decodedToken = decodeURIComponent(encodedToken);
      } catch {
        // Keep the original token if decode fails.
      }

      const colonIndex = decodedToken.indexOf(":");
      const redactedToken =
        colonIndex >= 0 ? `${decodedToken.slice(0, colonIndex)}:***` : "***";

      return `/bot${encodeURIComponent(redactedToken)}${suffix}`;
    });
  };

  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${redactPath(parsed.pathname)}${parsed.search}${parsed.hash}`;
  } catch {
    return redactPath(raw);
  }
}

export function sanitizeLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) {
    if ((key === "upload_api_url" || key === "uploadAPIURL") && typeof entry === "string") {
      sanitized[key] = redactUploadApiUrl(entry);
      continue;
    }
    sanitized[key] = sanitizeLogValue(entry);
  }
  return sanitized;
}
