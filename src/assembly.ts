import { assemble } from "@mit-sdg/sync-engine/assembly";
import { createComposition } from "./compositions/OnDeck.ts";
import { applicationConceptSet as defaultConceptSet, createApplicationConceptSet, defaultInstances } from "./concepts.ts";
import { createInstances } from "./instances.ts";
import { db } from "./db.ts";
import type { Db } from "mongodb";
import type { Extractor } from "./compositions/reads.ts";

export function assembleApplication(database: Db = db, extract?: Extractor) {
  const useDefault = database === db && extract === undefined;
  const instances = useDefault ? defaultInstances : createInstances(database);
  const applicationConceptSet = useDefault ? defaultConceptSet : createApplicationConceptSet(instances, extract ?? (async () => null));
  return assemble({
    conceptSet: applicationConceptSet,
    instances,
    composition: { OnDeck: createComposition(applicationConceptSet) },
    rawFaultReporter: ({ error }) => console.error(error),
  });
}
