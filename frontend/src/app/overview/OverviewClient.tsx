"use client";

import { useRouter } from "next/navigation";
import { PlantSynoptic } from "@/components/mimic/PlantSynoptic";
import { eqId, type PlantConfig } from "@/lib/plant-config";

export function OverviewClient({ config }: { config: PlantConfig }) {
  const router = useRouter();
  // Al hacer clic en un objeto del mímico, abrimos su Ficha-360 en Equipos.
  const onSelect = (code: string) => router.push(`/equipment?focus=${eqId(code)}`);
  return <PlantSynoptic config={config} onSelect={onSelect} />;
}
