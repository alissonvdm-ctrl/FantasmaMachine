import { describe, expect, it } from "vitest";
import { encontrarLinkHandoffSso } from "@/worker/vendpago/scraper";

describe("encontrarLinkHandoffSso", () => {
  const linksReais = [
    { text: "ERP", href: "/" },
    {
      text: "VendTEF",
      href: "https://www.portalvendtef.com.br/token/30a6fd23ecec316e02bb97/link_redirect/;/banco_redirect/op_loja_fantasma/oid/9349/client_redirect/",
    },
    {
      text: "PayBlu",
      href: "https://www.portalpayblu.com.br/token/30a6fd23ecec316e02bb97/link_redirect/;/banco_redirect/op_loja_fantasma/oid/9349/client_redirect/",
    },
    { text: "Estoque - LOJA FANTASMA", href: "javascript:void(0)" },
    { text: "A", href: "/perfil" },
  ];

  it("encontra o link de handoff para o host de destino", () => {
    const link = encontrarLinkHandoffSso(linksReais, "www.portalvendtef.com.br");

    expect(link).toBe(
      "https://www.portalvendtef.com.br/token/30a6fd23ecec316e02bb97/link_redirect/;/banco_redirect/op_loja_fantasma/oid/9349/client_redirect/",
    );
  });

  it("ignora hrefs relativos e inválidos como URL absoluta ao procurar", () => {
    const link = encontrarLinkHandoffSso(linksReais, "www.erpvending.com.br");

    expect(link).toBeNull();
  });

  it("retorna null quando nenhum link aponta para o host de destino", () => {
    const link = encontrarLinkHandoffSso(linksReais, "www.outrosistema.com.br");

    expect(link).toBeNull();
  });
});
