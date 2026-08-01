import { overtureFailure } from "./errors.js";
import type { OvertureBudgetTracker } from "./budgets.js";
import type {
  OvertureAssetQueryInput,
  OvertureAssetQueryResult,
} from "./types.js";

export interface OvertureAssetQueryEngine {
  readonly available: boolean;
  readonly transportKind: "secure_remote_geoparquet" | "unavailable" | "synthetic_test";
  query(input: OvertureAssetQueryInput & {
    readonly budget: Pick<OvertureBudgetTracker,
      "reserveRequest" | "recordDownload" | "assertActive">;
  }): Promise<OvertureAssetQueryResult>;
}

const trustedEngines = new WeakSet<object>();

function trusted<T extends OvertureAssetQueryEngine>(engine: T): T {
  trustedEngines.add(engine);
  return engine;
}

export function assertTrustedOvertureAssetQueryEngine(
  engine: unknown,
): asserts engine is OvertureAssetQueryEngine {
  if (!engine || typeof engine !== "object" || !trustedEngines.has(engine)) {
    throw overtureFailure("secure_remote_geoparquet_transport_unavailable", "Overture GeoParquet engine is not trusted", {
      category: "authorization_failed",
    });
  }
}

export function createUnavailableOvertureAssetQueryEngine(): OvertureAssetQueryEngine {
  return trusted(Object.freeze({
    available: false,
    transportKind: "unavailable" as const,
    async query(): Promise<OvertureAssetQueryResult> {
      throw overtureFailure(
        "secure_remote_geoparquet_transport_unavailable",
        "The runtime has no GeoParquet engine that can read capability-controlled byte ranges without hidden network access",
        { category: "unsupported_operation" },
      );
    },
  }));
}

export function createTestOnlyOvertureAssetQueryEngine(
  handler: OvertureAssetQueryEngine["query"],
): OvertureAssetQueryEngine {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Synthetic Overture query engine is available only under NODE_ENV=test");
  }
  return trusted({
    available: true,
    transportKind: "synthetic_test",
    query: handler,
  });
}
