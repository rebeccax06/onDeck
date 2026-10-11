import {
  createApp,
  computed,
  ref,
  onMounted,
  onUnmounted,
  watch,
} from "vue/dist/vue.esm-browser.js";
import { useAuth } from "./useAuth.ts";
import {
  ApiError,
  answer,
  type Activity,
  type Group,
  type Invitation,
} from "./api.ts";
import { ActivityCard } from "./components/ActivityCard.ts";
import { createLiveRefresh } from "./live-refresh.ts";
import type { OnDeckHttpContract } from "../src/http-contract.ts";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { OnDeckWireHttp } from "../generated/wire.ts";

const blank = () => ({
  name: "",
  source: "",
  description: "",
  location: "",
  category: "",
  cost: "",
  currency: "USD",
  dateTime: "",
});
const optional = (value: string) => value.trim() || undefined;
const instant = (value: string) =>
  value ? new Date(value).toISOString() : undefined;

createApp({
  components: { ActivityCard },
  setup() {
    const {
      user,
      accountName,
      authReady,
      authError,
      getToken,
      signIn,
      signUp,
      editProfile,
      signOut: clerkSignOut,
    } = useAuth(() => {
      live.invalidate();
      if (busy.value) {
        window.location.reload();
        return;
      }
      clearAccountState();
      if (user.value) void run(refresh);
    });
    const names = ref<Record<string, string>>({});
    const namesWarning = ref("");
    const person = (id: string) =>
      id === user.value
        ? accountName.value
        : names.value[id] || `Member · ${id.slice(-6)}`;
    const client = createHttpClient<OnDeckHttpContract>({
      baseUrl: "/api",
      fetch: Object.assign(
        (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              ...(init?.signal ? [init.signal] : []),
              AbortSignal.timeout(10_000),
            ]),
          }),
        { preconnect: fetch.preconnect },
      ),
      headers: async () => {
        const token = await getToken();
        if (!token) throw new Error("Please sign in again.");
        return { Authorization: `Bearer ${token}` };
      },
    });
    const busy = ref(false),
      message = ref(""),
      error = ref("");
    const tab = ref("deck"),
      groups = ref<Group[]>([]),
      invitations = ref<Invitation[]>([]);
    const group = ref(""),
      members = ref<string[]>([]),
      activities = ref<Activity[]>([]);
    const detail = ref<Activity | null>(null),
      groupName = ref(""),
      invitee = ref("");
    const source = ref(""),
      capture = ref(""),
      savedActivity = ref("");
    const fields = ref(blank()),
      shareGroups = ref<string[]>([]),
      sharedGroups = ref<string[]>([]);
    const participants = ref<string[]>([]);
    const filters = ref({
      category: "",
      location: "",
      maxCost: "",
      currency: "USD",
      from: "",
      until: "",
    });
    const options = ref<
      OnDeckWireHttp["/pick/options"]["output"]["book"]["result"]["options"]
    >([]);
    const picked = ref(false);
    let submittedPick: OnDeckHttpContract["/pick/options"]["input"] | null =
      null;
    const syncWarning = ref("");
    let lastNamesAt = 0;
    let namesScope = "";
    const currentGroup = computed(() =>
      groups.value.find((g) => g.group === group.value),
    );
    const ownStatus = computed(() =>
      detail.value?.members.find((m) => m.user === user.value),
    );
    async function run(task: () => Promise<void>, success = "") {
      if (busy.value) return;
      live.invalidate();
      busy.value = true;
      error.value = "";
      message.value = "";
      try {
        await task();
        message.value = success;
      } catch (reason) {
        error.value =
          reason instanceof Error
            ? reason.message
            : "Could not reach the server. Please retry.";
      } finally {
        busy.value = false;
      }
    }
    async function loadGroup() {
      detail.value = null;
      options.value = [];
      picked.value = false;
      submittedPick = null;
      if (!group.value) {
        members.value = [];
        activities.value = [];
        return;
      }
      const [page, book] = await Promise.all([
        answer(client.groups.get({ user: user.value, group: group.value })),
        answer(
          client.activities.list({ user: user.value, group: group.value }),
        ),
      ]);
      members.value = page.page.members.map((m) => m.user);
      activities.value = book.book.activities;
      participants.value = members.value.filter((m) => m === user.value);
    }
    async function loadNames() {
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch("/auth/people", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Names unavailable");
        const result = (await response.json()) as {
          names: Record<string, string>;
        };
        names.value = result.names;
        namesWarning.value = "";
        lastNamesAt = Date.now();
      } catch {
        namesWarning.value =
          "Some names could not load. Retrying automatically.";
      }
    }
    async function refresh() {
      const [book, inbox] = await Promise.all([
        answer(client.groups.list({ user: user.value })),
        answer(client.invitations.list({ user: user.value })),
      ]);
      groups.value = book.book.groups;
      invitations.value = inbox.inbox.invitations;
      if (!groups.value.some((g) => g.group === group.value))
        group.value = groups.value[0]?.group ?? "";
      await loadGroup();
      await loadNames();
    }
    function clearAccountState() {
      group.value = "";
      groups.value = [];
      invitations.value = [];
      activities.value = [];
      lastNamesAt = 0;
      namesScope = "";
      syncWarning.value = "";
      submittedPick = null;
      names.value = {};
      namesWarning.value = "";
      members.value = [];
      detail.value = null;
      participants.value = [];
      options.value = [];
      picked.value = false;
      invitee.value = "";
      groupName.value = "";
      error.value = "";
      message.value = "";
      resetCapture();
    }
    async function signOut() {
      if (
        capture.value &&
        !window.confirm("Sign out and leave this unfinished draft?")
      )
        return;
      await run(clerkSignOut);
    }
    function createGroup() {
      return run(async () => {
        const result = await answer(
          client.groups.create({
            user: user.value,
            name: groupName.value.trim(),
          }),
        );
        group.value = result.group;
        groupName.value = "";
        await refresh();
      }, "Group created.");
    }
    function invite() {
      return run(async () => {
        await answer(
          client.groups.invite({
            user: user.value,
            group: group.value,
            invitee: invitee.value.trim(),
          }),
        );
        invitee.value = "";
      }, "Invitation sent. They can accept it from their own account.");
    }
    function invitationAction(invitation: string, accept: boolean) {
      return run(async () => {
        if (accept)
          group.value = (
            await answer(
              client.invitations.accept({ user: user.value, invitation }),
            )
          ).group;
        else
          await answer(
            client.invitations.decline({ user: user.value, invitation }),
          );
        await refresh();
      });
    }
    function leave() {
      return run(async () => {
        await answer(
          client.groups.leave({ user: user.value, group: group.value }),
        );
        await refresh();
      }, "You left the group.");
    }
    function startCapture() {
      return run(async () => {
        if (!capture.value)
          capture.value = (
            await answer(
              client.captures.start({
                user: user.value,
                source: source.value.trim(),
              }),
            )
          ).capture;
        const result = await answer(
          client.captures.get({ user: user.value, capture: capture.value }),
        );
        const draft = result.preview.capture;
        fields.value = {
          ...blank(),
          source: draft.source ?? source.value,
          ...draft.proposal,
          cost: draft.proposal?.cost == null ? "" : String(draft.proposal.cost),
          dateTime: draft.proposal?.dateTime
            ? localDate(draft.proposal.dateTime)
            : "",
        };
        shareGroups.value = group.value ? [group.value] : [];
      }, "Review the details before saving. If no details were extracted, enter them below.");
    }
    function discard() {
      return run(async () => {
        await answer(
          client.captures.discard({ user: user.value, capture: capture.value }),
        );
        resetCapture();
      }, "Draft discarded.");
    }
    function resetCapture() {
      capture.value = "";
      savedActivity.value = "";
      source.value = "";
      fields.value = blank();
      sharedGroups.value = [];
      shareGroups.value = [];
    }
    function save() {
      return run(async () => {
        if (!shareGroups.value.length)
          throw new Error("Choose at least one group.");
        if (!savedActivity.value) {
          const f = fields.value;
          savedActivity.value = (
            await answer(
              client.captures.confirm({
                user: user.value,
                capture: capture.value,
                name: f.name.trim(),
                source: optional(f.source),
                description: optional(f.description),
                location: optional(f.location),
                category: optional(f.category),
                cost: f.cost === "" ? undefined : Number(f.cost),
                currency:
                  f.cost === "" ? undefined : f.currency.trim().toUpperCase(),
                dateTime: instant(f.dateTime),
              }),
            )
          ).activity;
        }
        // Keep the confirmed activity and successful shares if a later group fails.
        for (const target of shareGroups.value.filter(
          (g) => !sharedGroups.value.includes(g),
        )) {
          try {
            await answer(
              client.activities["add-to-group"]({
                user: user.value,
                group: target,
                activity: savedActivity.value,
              }),
            );
          } catch (reason) {
            if (
              !(reason instanceof Error) ||
              reason.message !== "already suggested"
            )
              throw reason;
          }
          sharedGroups.value.push(target);
        }
        group.value = shareGroups.value[0]!;
        resetCapture();
        tab.value = "deck";
        await refresh();
      }, "Activity added. Your heart is on automatically.");
    }
    function toggleHeart(activity: Activity) {
      return run(async () => {
        const input = {
          user: user.value,
          group: group.value,
          activity: activity.activity,
        };
        await answer(
          activity.interestedMembers.includes(user.value)
            ? client.activities.unwant(input)
            : client.activities.want(input),
        );
        activities.value = (
          await answer(
            client.activities.list({ user: user.value, group: group.value }),
          )
        ).book.activities;
        if (detail.value?.activity === activity.activity) {
          detail.value = (
            await answer(client.activities.get(input))
          ).page.activity;
        }
        options.value = [];
        picked.value = false;
      });
    }
    function open(activity: Activity) {
      return run(async () => {
        detail.value = (
          await answer(
            client.activities.get({
              user: user.value,
              group: group.value,
              activity: activity.activity,
            }),
          )
        ).page.activity;
      });
    }
    function update(
      action: "heart" | "complete" | "undo" | "withdraw" | "repeat",
      preference: "UNKNOWN" | "YES" | "NO" = "UNKNOWN",
    ) {
      return run(async () => {
        if (!detail.value) return;
        const row = detail.value,
          input = {
            user: user.value,
            group: group.value,
            activity: row.activity,
          };
        if (action === "heart")
          await answer(
            ownStatus.value?.wanted
              ? client.activities.unwant(input)
              : client.activities.want(input),
          );
        if (action === "complete")
          await answer(client.activities.complete(input));
        if (action === "undo")
          await answer(client.activities["undo-completion"](input));
        if (action === "withdraw")
          await answer(
            client.activities.withdraw({
              user: user.value,
              suggestion: row.suggestion,
            }),
          );
        if (action === "repeat")
          await answer(
            client.activities["repeat-preference"]({ ...input, preference }),
          );
        await loadGroup();
        if (action !== "withdraw")
          detail.value = (
            await answer(client.activities.get(input))
          ).page.activity;
      });
    }
    function pick() {
      return run(async () => {
        const f = filters.value;
        const input = {
          user: user.value,
          group: group.value,
          participants: [...participants.value],
          category: optional(f.category),
          location: optional(f.location),
          maxCost: f.maxCost === "" ? undefined : Number(f.maxCost),
          currency:
            f.maxCost === "" ? undefined : f.currency.trim().toUpperCase(),
          from: instant(f.from),
          until: instant(f.until),
        };
        const result = await answer(client.pick.options(input));
        submittedPick = input;
        options.value = result.book.result.options;
        picked.value = true;
      });
    }
    // Read-only snapshots keep background updates separate from form state and writes.
    const live = createLiveRefresh(
      async () => {
        if (!user.value || busy.value || document.hidden) return null;
        const actor = user.value;
        const previousGroup = group.value;
        const [book, inbox] = await Promise.all([
          answer(client.groups.list({ user: actor })),
          answer(client.invitations.list({ user: actor })),
        ]);
        let selectedGroup = book.book.groups.some(
          (g) => g.group === previousGroup,
        )
          ? previousGroup
          : (book.book.groups[0]?.group ?? "");
        let nextMembers: string[] = [];
        let nextActivities: Activity[] = [];
        if (selectedGroup) {
          try {
            const [page, collection] = await Promise.all([
              answer(client.groups.get({ user: actor, group: selectedGroup })),
              answer(
                client.activities.list({ user: actor, group: selectedGroup }),
              ),
            ]);
            nextMembers = page.page.members.map((m) => m.user);
            nextActivities = collection.book.activities;
          } catch (reason) {
            if (
              !(reason instanceof ApiError) ||
              !["FORBIDDEN", "NOT_FOUND"].includes(reason.code)
            )
              throw reason;
            selectedGroup = ""; // Membership may have changed between these reads.
          }
        }
        let nextOptions: typeof options.value | null = null;
        let nextPick = submittedPick;
        if (picked.value && nextPick?.group === selectedGroup) {
          nextPick = {
            ...nextPick,
            participants: nextPick.participants.filter((id) =>
              nextMembers.includes(id),
            ),
          };
          if (nextPick.participants.length) {
            try {
              nextOptions = (await answer(client.pick.options(nextPick))).book
                .result.options;
            } catch (reason) {
              if (
                !(reason instanceof ApiError) ||
                !["FORBIDDEN", "NOT_FOUND", "INVALID_REQUEST"].includes(
                  reason.code,
                )
              )
                throw reason;
              nextPick = null;
              nextOptions = [];
            }
          } else {
            nextPick = null;
            nextOptions = [];
          }
        }
        const scope = JSON.stringify([
          actor,
          selectedGroup,
          nextMembers,
          inbox.inbox.invitations.map((i) => i.inviter),
        ]);
        let nextNames: Record<string, string> | null = null;
        let nameFailure = false;
        if (
          scope !== namesScope ||
          Date.now() - lastNamesAt > 60_000 ||
          namesWarning.value
        ) {
          try {
            const token = await getToken();
            if (!token) throw new Error("No session");
            const response = await fetch("/auth/people", {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) throw new Error("Names unavailable");
            nextNames = (
              (await response.json()) as { names: Record<string, string> }
            ).names;
          } catch {
            nameFailure = true;
          }
        }
        return {
          previousGroup,
          selectedGroup,
          groups: book.book.groups,
          invitations: inbox.inbox.invitations,
          members: nextMembers,
          activities: nextActivities,
          options: nextOptions,
          pick: nextPick,
          names: nextNames,
          scope,
          nameFailure,
        };
      },
      (snapshot) => {
        if (!snapshot) return;
        const sameGroup = snapshot.previousGroup === snapshot.selectedGroup;
        groups.value = snapshot.groups;
        invitations.value = snapshot.invitations;
        group.value = snapshot.selectedGroup;
        members.value = snapshot.members;
        activities.value = snapshot.activities;
        participants.value = sameGroup
          ? participants.value.filter((id) => snapshot.members.includes(id))
          : snapshot.members.filter((id) => id === user.value);
        if (detail.value)
          detail.value = sameGroup
            ? (snapshot.activities.find(
                (a) => a.activity === detail.value?.activity,
              ) ?? null)
            : null;
        if (!sameGroup) {
          options.value = [];
          picked.value = false;
          submittedPick = null;
        } else if (snapshot.options !== null) {
          options.value = snapshot.options;
          submittedPick = snapshot.pick;
          if (!snapshot.pick) picked.value = false;
        }
        if (snapshot.names) {
          names.value = snapshot.names;
          lastNamesAt = Date.now();
          namesScope = snapshot.scope;
          namesWarning.value = "";
        }
        if (snapshot.nameFailure)
          namesWarning.value =
            "Some names could not load. Retrying automatically.";
        syncWarning.value = "";
      },
      (reason) => {
        syncWarning.value =
          reason instanceof ApiError && reason.code === "UNAUTHORIZED"
            ? "Sign in again to resume updates."
            : "Updates paused — reconnecting automatically…";
      },
    );
    watch(group, () => live.invalidate(), { flush: "sync" });
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    const resumeUpdates = () => {
      if (!document.hidden) void live.refresh();
    };
    onMounted(() => {
      refreshTimer = setInterval(resumeUpdates, 3000);
      window.addEventListener("focus", resumeUpdates);
      document.addEventListener("visibilitychange", resumeUpdates);
    });
    onUnmounted(() => {
      live.dispose();
      clearInterval(refreshTimer);
      window.removeEventListener("focus", resumeUpdates);
      document.removeEventListener("visibilitychange", resumeUpdates);
    });
    function safeLink(value?: string) {
      try {
        const url = new URL(value ?? "");
        return ["http:", "https:"].includes(url.protocol)
          ? url.href
          : undefined;
      } catch {
        return undefined;
      }
    }
    function cost(row: Activity) {
      return row.cost == null
        ? "Cost unknown"
        : `${row.cost} ${row.currency ?? ""}`;
    }
    function localDate(value: string) {
      const d = new Date(value);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
    return {
      user,
      accountName,
      syncWarning,
      namesWarning,
      person,
      editProfile,
      authReady,
      authError,
      signIn,
      signUp,
      signOut,
      busy,
      message,
      error,
      tab,
      groups,
      invitations,
      group,
      members,
      activities,
      detail,
      groupName,
      invitee,
      source,
      capture,
      savedActivity,
      fields,
      shareGroups,
      sharedGroups,
      participants,
      filters,
      options,
      picked,
      currentGroup,
      ownStatus,
      run,
      refresh,
      loadGroup,
      toggleHeart,
      createGroup,
      invite,
      invitationAction,
      leave,
      startCapture,
      discard,
      save,
      open,
      update,
      pick,
      safeLink,
      cost,
    };
  },
}).mount("#app");
