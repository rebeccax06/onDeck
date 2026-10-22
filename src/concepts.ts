import { createInstances } from "./instances.ts";
import { db } from "./db.ts";
import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { activityCapturing } from "./concepts/ActivityCapturing.registry.ts";
import { membershipTracking } from "./concepts/MembershipTracking.registry.ts";
import { suggesting } from "./concepts/Suggesting.registry.ts";
import { wanting } from "./concepts/Wanting.registry.ts";
import { groupOrdering } from "./concepts/GroupOrdering.registry.ts";
import { experiencing } from "./concepts/Experiencing.registry.ts";

import { checkedDetails } from "./concepts/Concept.ts";
import { applicationReads, type Filters } from "./compositions/reads.ts";
import type { Extractor, Instances } from "./compositions/reads.ts";

export function createApplicationConceptSet(
  instances: Instances,
  extract: Extractor,
) {
  const reads = applicationReads(instances);
  return conceptSet(
    {
      GroupOrdering: groupOrdering,
      ActivityCapturing: activityCapturing,
      MembershipTracking: membershipTracking,
      Suggesting: suggesting,
      Wanting: wanting,
      Experiencing: experiencing,
    },
    {
      groupCards: async ({ user }: { user: string }) => {
        const groups = await instances.MembershipTracking._groups({ user });
        const { order } = await instances.GroupOrdering._get({ user });
        const rank = new Map(order.map((id, i) => [id, i]));
        groups.sort(
          (a, b) =>
            (rank.get(a.group) ?? Infinity) - (rank.get(b.group) ?? Infinity),
        );
        return Promise.all(
          groups.map(async (group) => ({
            ...group,
            members: (
              await instances.MembershipTracking._members({
                group: group.group,
              })
            ).map((m) => m.user),
            cover: (
              await instances.MembershipTracking._cover({ group: group.group })
            ).cover,
          })),
        );
      },
      groupAccessError: ({ user, group }: { user: string; group: string }) =>
        reads.groupError(user, group),
      activityAccessError: ({
        user,
        group,
        activity,
      }: {
        user: string;
        group: string;
        activity: string;
      }) => reads.activityError(user, group, activity),
      captureAccessError: ({
        user,
        capture,
      }: {
        user: string;
        capture: string;
      }) => reads.captureError(user, capture),
      withdrawalAccessError: ({
        user,
        suggestion,
      }: {
        user: string;
        suggestion: string;
      }) => reads.withdrawalError(user, suggestion),
      addAccessError: ({
        user,
        group,
        activity,
      }: {
        user: string;
        group: string;
        activity: string;
      }) => reads.addError(user, group, activity),
      participantError: ({
        group,
        participants,
        filters,
      }: {
        group: string;
        participants: string[];
        filters: Filters;
      }) => reads.participantError(group, participants, filters),
      groupCollection: ({ group }: { group: string }) =>
        reads.collection(group),
      activityPage: async ({
        group,
        activity,
      }: {
        group: string;
        activity: string;
      }) =>
        (await reads.collection(group)).find(
          (row) => row.activity === activity,
        ) ?? null,
      capturePreview: async ({ capture }: { capture: string }) => {
        const [pending] = await instances.ActivityCapturing._capture({
          capture,
        });
        const [proposal] = await instances.ActivityCapturing._proposal({
          capture,
        });
        return { ...pending, proposal: proposal ?? null };
      },
      pickOptions: ({
        group,
        participants,
        filters,
      }: {
        group: string;
        participants: string[];
        filters: Filters;
      }) => reads.options(group, participants, filters),
      pickAccessError: async ({
        user,
        group,
        participants,
        filters,
      }: {
        user: string;
        group: string;
        participants: string[];
        filters: Filters;
      }) =>
        (await reads.groupError(user, group)) ||
        (await reads.participantError(group, participants, filters)),
      pickFilters: ({
        category,
        location,
        maxCost,
        currency,
        from,
        until,
      }: {
        category: string | null;
        location: string | null;
        maxCost: number | null;
        currency: string | null;
        from: string | null;
        until: string | null;
      }) => ({ category, location, maxCost, currency, from, until }),
      extractDetails: async ({ source }: { source: string }) => {
        try {
          const proposal = await extract(source);
          const fields = proposal ? checkedDetails(proposal) : null;
          return {
            name: fields?.name ?? null,
            proposedSource: fields?.source ?? null,
            description: fields?.description ?? null,
            location: fields?.location ?? null,
            category: fields?.category ?? null,
            cost: fields?.cost ?? null,
            currency: fields?.currency ?? null,
            dateTime: fields?.dateTime ?? null,
          };
        } catch {
          return {
            name: null,
            proposedSource: null,
            description: null,
            location: null,
            category: null,
            cost: null,
            currency: null,
            dateTime: null,
          };
        }
      },
    },
  );
}

// Stable export used by the generated client types. Constructors do not connect to MongoDB.
export const defaultInstances = createInstances(db);
export const applicationConceptSet = createApplicationConceptSet(
  defaultInstances,
  async () => null,
);
