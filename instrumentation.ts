import { registerOTel } from "@vercel/otel";

import { RespanExporter } from "@respan/exporter-vercel";

export function register(): void {
  const apiKey = process.env.RESPAN_API_KEY;

  if (apiKey) {
    registerOTel({
      serviceName: "weekend-dispatch",
      traceExporter: new RespanExporter({ apiKey }),
    });
    return;
  }

  registerOTel({
    serviceName: "weekend-dispatch",
  });
}
