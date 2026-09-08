import { describe, expect, it, vi } from "vitest";
import { applyReadOnlyGuard } from "@/worker/vendpago/readOnlyGuard";
import type { BrowserContext } from "playwright-core";

function createFakeRoute(method: string, url: string) {
  const request = { method: () => method, url: () => url };
  return {
    request: () => request,
    abort: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn().mockResolvedValue(undefined),
  };
}

type RouteHandler = (route: ReturnType<typeof createFakeRoute>) => Promise<void>;

async function setupGuard(erpHost: string) {
  let handler: RouteHandler | undefined;
  const context = {
    route: vi.fn(async (_pattern: string, fn: RouteHandler) => {
      handler = fn;
    }),
  } as unknown as BrowserContext;

  const guard = await applyReadOnlyGuard(context, erpHost);
  if (!handler) throw new Error("Handler não registrado pelo guard");
  return { handler, guard };
}

describe("applyReadOnlyGuard (AT-004)", () => {
  const erpHost = "www.erpvending.com.br";

  it("permite requisições GET ao host do ERP e não registra bloqueio", async () => {
    const { handler, guard } = await setupGuard(erpHost);
    const route = createFakeRoute("GET", `https://${erpHost}/estoque`);

    await handler(route);

    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
    expect(guard.getBlockedAttempt()).toBeNull();
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])(
    "aborta %s ao host do ERP e registra a tentativa bloqueada",
    async (method) => {
      const { handler, guard } = await setupGuard(erpHost);
      const url = `https://${erpHost}/estoque/1`;
      const route = createFakeRoute(method, url);

      await handler(route);

      expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
      expect(route.continue).not.toHaveBeenCalled();
      expect(guard.getBlockedAttempt()).toEqual({ method, url });
    },
  );

  it("permite POST para hosts fora do domínio do ERP", async () => {
    const { handler, guard } = await setupGuard(erpHost);
    const route = createFakeRoute("POST", "https://cdn.example.com/assets");

    await handler(route);

    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
    expect(guard.getBlockedAttempt()).toBeNull();
  });
});
