import { afterEach, describe, expect, it, vi } from "vitest";

function buildMatchHistoryEntry(config: {
  handNumber: number;
  roundSeed: string;
  team0: number;
  team1: number;
}) {
  return {
    handNumber: config.handNumber,
    roundSeed: config.roundSeed,
    teamScores: {
      "team-0": config.team0,
      "team-1": config.team1
    },
    cumulativeScores: {
      "team-0": config.team0,
      "team-1": config.team1
    },
    finishOrder: ["seat-0", "seat-2", "seat-1", "seat-3"] as const,
    doubleVictory: null,
    tichuBonuses: []
  };
}

describe("self-play match semantics", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@tichuml/engine");
  });

  it("continues dealing hands until the cumulative match target is reached", async () => {
    const createInitialGameState = vi
      .fn()
      .mockImplementationOnce((seedOrConfig: unknown) => {
        expect(seedOrConfig).toBe("semantic-seed-0");
        return {
          nextState: {
            phase: "finished",
            matchComplete: false,
            matchWinner: null,
            matchScore: {
              "team-0": 840,
              "team-1": 700
            },
            matchHistory: [
              buildMatchHistoryEntry({
                handNumber: 1,
                roundSeed: "semantic-seed-0",
                team0: 840,
                team1: 700
              })
            ]
          },
          derivedView: {
            phase: "finished",
            matchScore: {
              "team-0": 840,
              "team-1": 700
            },
            matchComplete: false,
            matchWinner: null
          },
          legalActions: {},
          events: []
        };
      })
      .mockImplementationOnce((seedOrConfig: unknown) => {
        expect(seedOrConfig).toMatchObject({
          seed: "semantic-seed-0-hand-2",
          matchScore: {
            "team-0": 840,
            "team-1": 700
          },
          matchHistory: [
            buildMatchHistoryEntry({
              handNumber: 1,
              roundSeed: "semantic-seed-0",
              team0: 840,
              team1: 700
            })
          ]
        });
        return {
          nextState: {
            phase: "finished",
            matchComplete: true,
            matchWinner: "team-0",
            matchScore: {
              "team-0": 1040,
              "team-1": 840
            },
            matchHistory: [
              buildMatchHistoryEntry({
                handNumber: 1,
                roundSeed: "semantic-seed-0",
                team0: 840,
                team1: 700
              }),
              {
                handNumber: 2,
                roundSeed: "semantic-seed-0-hand-2",
                teamScores: {
                  "team-0": 200,
                  "team-1": 140
                },
                cumulativeScores: {
                  "team-0": 1040,
                  "team-1": 840
                },
                finishOrder: ["seat-1", "seat-3", "seat-0", "seat-2"] as const,
                doubleVictory: null,
                tichuBonuses: []
              }
            ]
          },
          derivedView: {
            phase: "finished",
            matchScore: {
              "team-0": 1040,
              "team-1": 840
            },
            matchComplete: true,
            matchWinner: "team-0"
          },
          legalActions: {},
          events: []
        };
      });

    vi.doMock("@tichuml/engine", async () => {
      const actual =
        await vi.importActual<typeof import("@tichuml/engine")>(
          "@tichuml/engine"
        );
      return {
        ...actual,
        createInitialGameState
      };
    });

    const { runSelfPlayBatch } = await import(
      "../../apps/sim-runner/src/self-play-batch"
    );

    const summary = await runSelfPlayBatch({
      games: 1,
      baseSeed: "semantic-seed",
      defaultProvider: "local",
      telemetryEnabled: false,
      quiet: true
    });

    expect(createInitialGameState).toHaveBeenCalledTimes(2);
    expect(summary.gamesPlayed).toBe(1);
    expect(summary.handsPlayed).toBe(2);
    expect(summary.lastCompletedGameId).toBe(
      "selfplay-semantic-seed-game-000001"
    );
    expect(summary.lastCompletedHandId).toBe(
      "selfplay-semantic-seed-game-000001-hand-2"
    );
    expect(summary.lastCompletedMatchScore).toEqual({
      "team-0": 1040,
      "team-1": 840
    });
    expect(summary.lastCompletedMatchWinner).toBe("team-0");
    expect(summary.totalScoreByTeam).toEqual({
      "team-0": 1040,
      "team-1": 840
    });
  });
});
