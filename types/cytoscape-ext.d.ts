/**
 * Ambient declarations for the Cytoscape layout extensions, which ship no
 * bundled types. They register via `cytoscape.use(ext)` (see
 * `components/topology/graph/cy-register.ts`).
 */
declare module "cytoscape-fcose" {
  import type cytoscape from "cytoscape";
  const ext: cytoscape.Ext;
  export default ext;
}

declare module "cytoscape-dagre" {
  import type cytoscape from "cytoscape";
  const ext: cytoscape.Ext;
  export default ext;
}
