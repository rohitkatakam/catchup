import "server-only";

import { SpanStatusCode, trace } from "@opentelemetry/api";

type TelemetryAttributeValue = string | number | boolean | undefined;

export type TelemetryAttributes = Record<string, TelemetryAttributeValue>;

export async function runWithTelemetry<T>(
  spanName: string,
  operation: () => Promise<T>,
  attributes: TelemetryAttributes = {},
): Promise<T> {
  const tracer = trace.getTracer("weekend-dispatch");
  const span = tracer.startSpan(spanName);

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  }

  try {
    const result = await operation();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}
