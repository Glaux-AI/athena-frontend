/**
 * One-time registration of the Cytoscape layout extensions used by the
 * knowledge graph: `fcose` (fast compound-aware force layout) and `dagre`
 * (layered top-down). Idempotent + HMR-safe — `cytoscape.use` throws if an
 * extension name is registered twice, so we guard and swallow.
 */
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import dagre from "cytoscape-dagre";

let registered = false;

export function registerCytoscapeExtensions(): void {
  if (registered) return;
  try {
    cytoscape.use(fcose);
  } catch {
    /* already registered (HMR) */
  }
  try {
    cytoscape.use(dagre);
  } catch {
    /* already registered (HMR) */
  }
  registered = true;
}
