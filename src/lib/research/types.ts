import type {
  ResearchCandidate,
  ResearchFact,
  ResearchSource,
} from "../investment";
export type {
  ResearchSnapshot,
  ResearchCandidate,
  ResearchFact,
  ResearchSource,
} from "../investment";

export type SourceCheck = {
  url: string;
  status:
    | "PARSED"
    | "ACCESS_BLOCKED"
    | "FAILED"
    | "POLICY_REVIEW"
    | "ROBOTS_DENIED"
    | "UNSUPPORTED"
    | "BUDGET_DEFERRED";
  checkedAt: string;
  sha256?: string;
  httpStatus?: number;
  reason?: string;
  semanticHash?: string;
};
export type Discovery = {
  url: string;
  kind: "LISTING" | "OFFICIAL_RELEASE" | "CONTEXT" | "POLICY";
  discoveredFrom: string;
  status: "ALLOWED" | "REVIEW_REQUIRED";
};
export type AcquisitionResult = {
  sources: ResearchSource[];
  facts: ResearchFact[];
  candidates: ResearchCandidate[];
  discoveries: Discovery[];
  checks: SourceCheck[];
};
export type ResearchFetchResult = {
  url: string;
  status: number;
  body: string;
  sha256: string;
  checkedAt: string;
  contentType: string;
};
export type ResearchFetcher = (
  url: string,
  options?: { maxBytes?: number; timeoutMs?: number },
) => Promise<ResearchFetchResult>;
export type ResearchTrigger = "MANUAL" | "SCHEDULED" | "SCHEDULED_PROBE";
export type ResearchChange = {
  kind:
    | "NEW_CANDIDATE"
    | "PRICE_CHANGED"
    | "FACT_CHANGED"
    | "SOURCE_INVALIDATED"
    | "DECISION_REVISED"
    | "CANDIDATE_CHANGED";
  key: string;
  before: string | null;
  after: string | null;
  reason: string;
};
