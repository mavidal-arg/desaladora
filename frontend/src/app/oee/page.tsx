import { redirect } from "next/navigation";

// "OEE (Eficiencia RO)" se fusionó dentro de Panel principal (/overview) en V2.
// El componente OeeClient (./OeeClient) se conserva y se reutiliza allí; esta ruta redirige.
export const dynamic = "force-dynamic";

export default function OeePage() {
  redirect("/overview");
}
