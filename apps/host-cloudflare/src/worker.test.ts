import { describe, expect, it } from "@effect/vitest";
// oxlint-disable-next-line executor/no-vitest-import -- boundary: vi.mock must come from vitest itself for mock hoisting to resolve
import { vi } from "vitest";

const makeCloudflareApp = vi.hoisted(() => vi.fn());

vi.mock("./app", () => ({ makeCloudflareApp }));
vi.mock("./mcp", () => ({ McpExecutionOwnerDirectoryDO: class {}, McpSessionDO: class {} }));

import worker from "./worker";

const env = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "aud",
} as Parameters<typeof worker.fetch>[1];
const ctx = {} as ExecutionContext;

const builtApp = () =>
  Promise.resolve({
    toWebHandler: () => ({ handler: async () => new Response("ok") }),
    mcpAgentHandler: async () => new Response("mcp"),
  });

describe("worker fetch", () => {
  it("serves later requests when an earlier startup never settles or fails", async () => {
    // A canceled request's startup I/O never settles on Workers; a transient
    // D1 failure rejects. Neither may wedge the isolate for later requests.
    makeCloudflareApp
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockRejectedValueOnce("D1 unavailable")
      .mockImplementation(builtApp);

    void worker.fetch(new Request("https://executor.test/api/account/me"), env, ctx);
    await expect(
      worker.fetch(new Request("https://executor.test/api/account/me"), env, ctx),
    ).rejects.toBe("D1 unavailable");

    const response = await worker.fetch(
      new Request("https://executor.test/api/account/me"),
      env,
      ctx,
    );
    expect(await response.text()).toBe("ok");

    await worker.fetch(new Request("https://executor.test/api/account/me"), env, ctx);
    expect(makeCloudflareApp).toHaveBeenCalledTimes(3);
  });
});
