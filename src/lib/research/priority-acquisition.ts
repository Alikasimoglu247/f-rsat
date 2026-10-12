import { collectResearch } from "./acquisition";
import { authorizedFileProvider } from "./authorized-feed";

export async function collectPriorityResearch(
  options: Parameters<typeof collectResearch>[0] = {},
) {
  // Listing ingestion comes only from an explicitly granted provider. Public
  // pages remain supporting macro/regional evidence, not the inventory engine.
  const listings = await authorizedFileProvider.read(options);
  const context = await collectResearch({
    ...options,
    supportingListings: false,
  });
  return {
    sources: [...listings.sources, ...context.sources],
    facts: [...listings.facts, ...context.facts],
    candidates: listings.candidates,
    discoveries: [...listings.discoveries, ...context.discoveries],
    checks: [...listings.checks, ...context.checks],
  };
}
