"use client";

import { createContext, useContext, type ReactNode } from "react";
import { PLANT } from "@/lib/plant-config";
import { tokensDeMarca, type Brand } from "@/lib/brand";

/**
 * Identidad de la aplicación, disponible en todo el árbol cliente.
 *
 * Antes `branding.primary/accent/logo` se editaban en Admin y NO los leía nadie:
 * se guardaban en la DB y no llegaban a ninguna pantalla. Acá se cierra ese
 * circuito — el layout raíz (servidor) lee la config y la baja por contexto, y
 * de paso se inyectan los tokens de color para que el cambio se vea de verdad.
 *
 * Los helpers puros (iniciales, esImagen, tokens) viven en `@/lib/brand`: el
 * layout y la vista AR son de servidor y no pueden llamar a un módulo cliente.
 */

const BrandContext = createContext<Brand>({ app: PLANT.app, branding: PLANT.branding });

export function useBrand(): Brand {
  return useContext(BrandContext);
}

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return (
    <BrandContext.Provider value={brand}>
      {/* Se renderiza también en el servidor: sin esto habría un parpadeo con
          los colores del template antes de hidratar. */}
      <style dangerouslySetInnerHTML={{ __html: tokensDeMarca(brand.branding) }} />
      {children}
    </BrandContext.Provider>
  );
}
