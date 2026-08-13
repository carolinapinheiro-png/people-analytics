import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { attachVerComo } from "@/lib/ver-como/attach";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // Os dois são globais porque valem para TODA server function. O primeiro
  // anexa o token; o segundo, o "ver como". Aplicar qualquer um deles arquivo
  // a arquivo seria esperar que ninguém esquecesse nenhum -- e o esquecimento
  // do segundo é invisível na tela.
  functionMiddleware: [attachSupabaseAuth, attachVerComo],
  requestMiddleware: [errorMiddleware],
}));
