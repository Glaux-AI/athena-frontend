// No mock task SSE: `/v1/tasks` has no mock-mode parity by locked decision
// (athena-docs/09-roadmap/product-work-rebuild.md - develop /work against the
// live backend). Passthrough alias kept only because
// `features/work/use-task-stream.ts` imports it.
export { sseStream as sseStreamOrMock } from "@/lib/sse/event-stream";
