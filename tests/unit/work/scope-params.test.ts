/**
 * The /work scope vocabulary (Work OS rehaul W6) - the pure URL <-> server
 * param mapping behind the scope bar.
 *
 * Pins:
 *  - `parseScope` accepts the new grammar (me / myteams / all / review /
 *    team:<id>), maps the legacy `mine`, and rejects garbage to "" (auto);
 *  - `resolveDefaultScope` lands a one-team member on their team, a
 *    multi-team member on the "my teams" union, and a teamless member on
 *    their own work;
 *  - `scopeToParams` yields exactly the server narrowing each scope needs
 *    ("myteams" and "all" contribute none - the union and review-board picks
 *    are client-side).
 */

import { describe, expect, it } from "vitest";

import {
  parseScope,
  resolveDefaultScope,
  scopeToParams,
} from "@/components/board/board-toolbar";
import type { MyTeam } from "@/lib/api/client";

const team = (id: string, role: MyTeam["role"] = "member"): MyTeam => ({
  id,
  name: id.toUpperCase(),
  slug: id,
  role,
});

describe("parseScope", () => {
  it("accepts the scope grammar verbatim", () => {
    expect(parseScope("me")).toBe("me");
    expect(parseScope("myteams")).toBe("myteams");
    expect(parseScope("all")).toBe("all");
    expect(parseScope("review")).toBe("review");
    expect(parseScope("team:t1")).toBe("team:t1");
  });

  it("maps the legacy 'mine' vocabulary to 'me'", () => {
    expect(parseScope("mine")).toBe("me");
  });

  it("rejects garbage and empties to '' (the auto default)", () => {
    expect(parseScope(null)).toBe("");
    expect(parseScope("")).toBe("");
    expect(parseScope("bogus")).toBe("");
    // A bare "team:" pins nothing - fall back rather than send an empty id.
    expect(parseScope("team:")).toBe("");
  });
});

describe("resolveDefaultScope", () => {
  it("one team -> that team's scope", () => {
    expect(resolveDefaultScope([team("t1")])).toBe("team:t1");
  });

  it("several teams -> the 'my teams' union", () => {
    expect(resolveDefaultScope([team("t1"), team("t2")])).toBe("myteams");
  });

  it("no teams -> my own work", () => {
    expect(resolveDefaultScope([])).toBe("me");
  });
});

describe("scopeToParams", () => {
  it("'me' fences by the signed-in user (and waits for one)", () => {
    expect(scopeToParams("me", { meId: "u1", surface: "list" })).toEqual({
      mine: "u1",
    });
    expect(scopeToParams("me", { meId: null, surface: "list" })).toEqual({});
  });

  it("'team:<id>' narrows server-side to that team", () => {
    expect(scopeToParams("team:t9", { meId: "u1", surface: "board" })).toEqual({
      team_id: "t9",
    });
  });

  it("'review' is a status param on the list, a client pick on the board", () => {
    expect(scopeToParams("review", { meId: "u1", surface: "list" })).toEqual({
      status: "in_review",
    });
    expect(scopeToParams("review", { meId: "u1", surface: "board" })).toEqual({});
  });

  it("'myteams' and 'all' contribute no server narrowing", () => {
    expect(scopeToParams("myteams", { meId: "u1", surface: "list" })).toEqual({});
    expect(scopeToParams("all", { meId: "u1", surface: "board" })).toEqual({});
  });
});
