import { redirect } from "next/navigation";

// "Producción de Agua" se eliminó como pantalla independiente (V2): sus burbujas y la
// tabla de membranas se reubicaron dentro de Panel principal (/overview).
export const dynamic = "force-dynamic";

export default function ProcesoPage() {
  redirect("/overview");
}
