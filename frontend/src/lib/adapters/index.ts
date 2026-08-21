// Adapter layer barrel. Import as namespaces so call sites read like the contract:
//   import { pi, sap, seSuite } from "@/lib/adapters";
//   const tree = await pi.getAssetTree();
export * as pi from "./pi";
export * as sap from "./sap";
export * as seSuite from "./seSuite";
export * from "./types";
