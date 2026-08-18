import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { LarkClient } from "../src/lark/client.js";

/**
 * Regression test: axios's default error for a non-2xx response is a
 * generic "Request failed with status code N", discarding the response
 * body where Lark's actual `code`/`msg` live. This is exactly what made a
 * real production failure ("Request failed with status code 400")
 * undiagnosable — see the response interceptor added in lark/client.ts.
 */
describe("LarkClient error messages", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url?.includes("tenant_access_token")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, tenant_access_token: "tok", expire: 7200 }));
        return;
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 91402, msg: "NOTEXIST: table not found" }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("includes the HTTP status, url and response body in the thrown error", async () => {
    const client = new LarkClient("app_id", "app_secret", baseUrl);

    await expect(client.listTables("app_token")).rejects.toThrow(
      /Lark API request failed \(HTTP 400\).*tables.*NOTEXIST: table not found/s
    );
  });
});
