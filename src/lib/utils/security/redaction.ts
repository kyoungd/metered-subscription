/**
 * PII Redaction Utilities
 * 
 * Removes sensitive personally identifiable information from logs and data.
 * Prevents accidental exposure of sensitive user data in logs.
 * 
 * @module lib/utils/security/redaction
 */

const REDACTED_VALUE = "[REDACTED]";

const PII_FIELDS = [
  "email",
  "name",
  "firstName",
  "first_name",
  "lastName",
  "last_name",
  "phone",
  "phoneNumber",
  "phone_number",
  "address",
  "ssn",
  "password",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "secret",
  "authorization",
  "bearer",
];

/**
 * Redacts PII fields from an object
 * 
 * @param data - Data object to redact
 * @returns New object with PII fields redacted
 */
export function redactPII(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data !== "object") {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map((item) => redactPII(item));
  }
  
  const redacted: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (PII_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      redacted[key] = REDACTED_VALUE;
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactPII(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Redacts sensitive headers from request headers
 * 
 * @param headers - Headers object or Headers instance
 * @returns Redacted headers object
 */
export function redactHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "authorization" || lowerKey.includes("token") || lowerKey.includes("key")) {
        result[key] = REDACTED_VALUE;
      } else {
        result[key] = value;
      }
    });
  } else {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "authorization" || lowerKey.includes("token") || lowerKey.includes("key")) {
        result[key] = REDACTED_VALUE;
      } else {
        result[key] = value;
      }
    }
  }
  
  return result;
}

