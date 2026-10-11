import { validInstant, type ActivityCapturingConcept } from "../concepts/Concept.ts";
import type { MembershipTrackingConcept } from "../concepts/MembershipTracking.ts";
import type { SuggestingConcept } from "../concepts/Suggesting.ts";
import type { WantingConcept } from "../concepts/Wanting.ts";
import type { ExperiencingConcept } from "../concepts/Experiencing.ts";

export type Instances = {
  ActivityCapturing: ActivityCapturingConcept;
  MembershipTracking: MembershipTrackingConcept;
  Suggesting: SuggestingConcept;
  Wanting: WantingConcept;
  Experiencing: ExperiencingConcept;
};
type GroupAccessError = "NO_SUCH_GROUP" | "NOT_A_MEMBER";
type ActivityAccessError = GroupAccessError | "NO_SUCH_ACTIVITY" | "ACTIVITY_NOT_IN_GROUP";
type ParticipantError = "NO_PARTICIPANTS" | "INVALID_PARTICIPANTS" | "INVALID_FILTERS";
export type Filters = {
  category?: string | null; location?: string | null; maxCost?: number | null;
  currency?: string | null; from?: string | null; until?: string | null;
};
export type Extractor = (source: string) => Promise<{
  name: string; source?: string; description?: string; location?: string;
  category?: string; cost?: number; currency?: string; dateTime?: string;
} | null>;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const normalize = (value?: string | null) => value?.trim().toLowerCase() || undefined;

/** Application reads join concept queries; no helper writes another concept's storage. */
export function applicationReads(instances: Instances) {
  const { MembershipTracking: membership, ActivityCapturing: capturing,
    Suggesting: suggesting, Wanting: wanting, Experiencing: experiencing } = instances;

  async function groupError(user: string, group: string): Promise<GroupAccessError | null> {
    if (!(await membership._get({ group })).length) return "NO_SUCH_GROUP";
    return (await membership._membership({ user, group })).member ? null : "NOT_A_MEMBER";
  }
  async function activityError(user: string, group: string, activity: string): Promise<ActivityAccessError | null> {
    const error = await groupError(user, group);
    if (error) return error;
    if (!(await capturing._get({ activity })).length) return "NO_SUCH_ACTIVITY";
    return (await suggesting._contains({ group, item: activity })).suggested ? null : "ACTIVITY_NOT_IN_GROUP";
  }
  async function captureError(user: string, capture: string): Promise<"NO_SUCH_CAPTURE" | "NOT_CAPTURE_OWNER" | null> {
    const row = (await capturing._capture({ capture }))[0];
    return !row ? "NO_SUCH_CAPTURE" : row.owner !== user ? "NOT_CAPTURE_OWNER" : null;
  }
  async function withdrawalError(user: string, suggestion: string): Promise<GroupAccessError | "NO_SUCH_SUGGESTION" | null> {
    const row = (await suggesting._get({ suggestion }))[0];
    return row ? groupError(user, row.group) : "NO_SUCH_SUGGESTION";
  }
  async function addError(user: string, group: string, activity: string): Promise<GroupAccessError | "NO_SUCH_ACTIVITY" | null> {
    return await groupError(user, group) || ((await capturing._get({ activity })).length ? null : "NO_SUCH_ACTIVITY");
  }
  async function statuses(group: string, item: string, participants?: string[]) {
    const users = participants ?? (await membership._members({ group })).map(({ user }) => user);
    return Promise.all(users.map(async (user) => {
      const [want, experience] = await Promise.all([
        wanting._wants({ user, item }), experiencing._get({ user, item }),
      ]);
      return { user, wanted: want.wanted, completed: experience.length > 0,
        repeatPreference: experience[0]?.repeatPreference ?? null };
    }));
  }
  async function collection(group: string, participants?: string[]) {
    const suggestions = await suggesting._forGroup({ group });
    const rows = await Promise.all(suggestions.map(async ({ suggestion, suggester, item: activity }) => {
      const details = (await capturing._get({ activity }))[0];
      if (!details) return null;
      const members = await statuses(group, activity, participants);
      return { suggestion, suggester, ...details, members,
        interestedMembers: members.filter((member) => member.wanted).map(({ user }) => user),
        completedMembers: members.filter((member) => member.completed)
          .map(({ user, repeatPreference }) => ({ user, repeatPreference })) };
    }));
    return rows.filter((row) => row !== null).sort((a, b) => compare(a.name, b.name) || compare(a.activity, b.activity));
  }
  async function participantError(group: string, participants: string[], filters: Filters): Promise<ParticipantError | null> {
    if (participants.length === 0) return "NO_PARTICIPANTS";
    const members = new Set((await membership._members({ group })).map(({ user }) => user));
    if (participants.some((user) => !members.has(user))) return "INVALID_PARTICIPANTS";
    if ((filters.maxCost == null) !== (filters.currency == null) ||
        (filters.maxCost != null && (!Number.isFinite(filters.maxCost) || filters.maxCost < 0)) ||
        (filters.currency != null && !Intl.supportedValuesOf("currency").includes(filters.currency))) return "INVALID_FILTERS";
    for (const value of [filters.from, filters.until]) {
      if (value != null && !validInstant(value)) return "INVALID_FILTERS";
    }
    if (filters.from && filters.until && Date.parse(filters.from) > Date.parse(filters.until)) return "INVALID_FILTERS";
    return null;
  }
  async function options(group: string, participants: string[], filters: Filters) {
    const selected = [...new Set(participants)];
    const applied: Filters = {};
    if (normalize(filters.category)) applied.category = filters.category!.trim();
    if (normalize(filters.location)) applied.location = filters.location!.trim();
    for (const key of ["maxCost", "currency", "from", "until"] as const) {
      if (filters[key] != null) Object.assign(applied, { [key]: filters[key] });
    }
    const rows = (await collection(group, selected)).filter((row) =>
      (!applied.category || normalize(row.category) === normalize(applied.category)) &&
      (!applied.location || !!normalize(row.location)?.includes(normalize(applied.location)!)) &&
      (applied.maxCost == null || (row.cost != null && row.cost <= applied.maxCost && row.currency === applied.currency)) &&
      (!applied.from || !!row.dateTime && Date.parse(row.dateTime) >= Date.parse(applied.from)) &&
      (!applied.until || !!row.dateTime && Date.parse(row.dateTime) <= Date.parse(applied.until))
    ).map((row) => ({ ...row,
      wantedCount: row.members.filter((member) => member.wanted).length,
      wantedWithoutCompletionCount: row.members.filter((member) => member.wanted && !member.completed).length,
      completedCount: row.members.filter((member) => member.completed).length,
      repeatYesCount: row.members.filter((member) => member.completed && member.repeatPreference === "YES").length,
    })).sort((a, b) => b.wantedCount - a.wantedCount ||
      b.wantedWithoutCompletionCount - a.wantedWithoutCompletionCount ||
      compare(a.name, b.name) || compare(a.activity, b.activity)).slice(0, 10);
    return { options: rows, participants: selected, filters: applied };
  }
  return { groupError, activityError, captureError, withdrawalError, addError, participantError, collection, statuses, options };
}
