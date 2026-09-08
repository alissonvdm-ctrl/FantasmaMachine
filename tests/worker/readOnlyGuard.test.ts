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

async function setupGuard(
  erpHost: string,
  allowedWritePathPrefixes: readonly string[] = [],
  allowedReadListingPathPatterns: readonly string[] = [],
) {
  let handler: RouteHandler | undefined;
  const context = {
    route: vi.fn(async (_pattern: string, fn: RouteHandler) => {
      handler = fn;
    }),
  } as unknown as BrowserContext;

  const guard = await applyReadOnlyGuard(context, erpHost, allowedWritePathPrefixes, allowedReadListingPathPatterns);
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

  it("permite POST ao caminho de login explicitamente liberado", async () => {
    const { handler, guard } = await setupGuard(erpHost, ["/auth/login"]);
    const route = createFakeRoute("POST", `https://${erpHost}/auth/login/index?ref=/produtos`);

    await handler(route);

    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
    expect(guard.getBlockedAttempt()).toBeNull();
  });

  it("continua bloqueando POST fora do caminho de login liberado", async () => {
    const { handler, guard } = await setupGuard(erpHost, ["/auth/login"]);
    const route = createFakeRoute("POST", `https://${erpHost}/produtos/1`);

    await handler(route);

    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(guard.getBlockedAttempt()).not.toBeNull();
  });

  it.each([
    `https://${erpHost}/produtos/listar/format/json`,
    `https://${erpHost}/estoque-interno/carregaRelatorioEstoque/format/json`,
  ])("permite POST em endpoint AJAX de leitura (%s) quando o sufixo é liberado", async (url) => {
    const { handler, guard } = await setupGuard(erpHost, ["/auth/login"], ["/format/json"]);
    const route = createFakeRoute("POST", url);

    await handler(route);

    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
    expect(guard.getBlockedAttempt()).toBeNull();
  });

  it("continua bloqueando POST de endpoint AJAX quando o sufixo não foi liberado", async () => {
    const { handler, guard } = await setupGuard(erpHost, ["/auth/login"]);
    const route = createFakeRoute("POST", `https://${erpHost}/produtos/listar/format/json`);

    await handler(route);

    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(guard.getBlockedAttempt()).not.toBeNull();
  });
});
