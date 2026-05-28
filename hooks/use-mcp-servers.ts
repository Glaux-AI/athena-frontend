"use client";

/**
 * MCP-server data hooks (readiness §6 r3 / row 997).
 *
 * The project does not have SWR / React Query installed for these
 * surfaces — we follow the existing `useEffect + useState` pattern from
 * `hooks/use-run-documents.ts`. Each hook returns the canonical
 * `{servers|server|approvals, isLoading, error}` shape so consumers can
 * render skeleton + content + error states without re-deriving status.
 *
 * Wire field names stay snake_case per ADR-032.
 */
import { useEffect, useState } from "react";

import { ApiError, type McpRecentCall, type McpServer } from "@/lib/api/client";
import {
  getMcpServer,
  getMcpServerApprovals,
  listMcpServers,
} from "@/lib/api/mcp";

interface UseMcpServersResult {
  servers: McpServer[];
  isLoading: boolean;
  error: string | null;
}

export function useMcpServers(): UseMcpServersResult {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await listMcpServers();
        if (!cancelled) setServers(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load MCP servers");
        setServers([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { servers, isLoading, error };
}

interface UseMcpServerResult {
  server: McpServer | null;
  isLoading: boolean;
  error: string | null;
  /** True when the BE returned 404 — pages turn this into `notFound()`. */
  notFound: boolean;
}

export function useMcpServer(id: string): UseMcpServerResult {
  const [server, setServer] = useState<McpServer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    (async () => {
      try {
        const result = await getMcpServer(id);
        if (!cancelled) setServer(result);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
          setServer(null);
        } else {
          setError(e instanceof ApiError ? e.message : "Failed to load MCP server");
          setServer(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { server, isLoading, error, notFound };
}

interface UseMcpServerApprovalsResult {
  approvals: McpRecentCall[];
  isLoading: boolean;
  error: string | null;
}

export function useMcpServerApprovals(
  id: string,
  limit = 20,
): UseMcpServerApprovalsResult {
  const [approvals, setApprovals] = useState<McpRecentCall[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await getMcpServerApprovals(id, limit);
        if (!cancelled) setApprovals(result);
      } catch (e) {
        if (cancelled) return;
        // Soft-fail: the recent-calls endpoint may return [] before the
        // agent runtime has emitted any mcp.tool.* events, but a network
        // failure should still surface.
        setError(e instanceof ApiError ? e.message : "Failed to load approval history");
        setApprovals([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, limit]);

  return { approvals, isLoading, error };
}
