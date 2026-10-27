import {
  createApp,
  computed,
  nextTick,
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
import { prepareGroupPicture } from "./group-picture.ts";
import { sortableGroups } from "./sortable-groups.ts";
import { ActivityDetails, type ActivityEdit } from "./components/ActivityDetails.ts";
import { GroupPicker } from "./components/GroupPicker.ts";
import { PictureEditor } from "./components/PictureEditor.ts";
import { FormSurface } from "./components/FormSurface.ts";
import {
  ConfirmDialog,
  type Confirmation,
} from "./components/ConfirmDialog.ts";
import { GroupCard } from "./components/GroupCard.ts";
import { createLiveConnection } from "./live-connection.ts";
import { ActivityCard } from "./components/ActivityCard.ts";
import { createLiveRefresh } from "./live-refresh.ts";
import type { DiscoveryResult } from "../src/discovery.ts";
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
  components: {
    ActivityCard,
    GroupCard,
    FormSurface,
    ConfirmDialog,
    PictureEditor,
    GroupPicker,
    ActivityDetails,
  },
  directives: { sortableGroups },
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
      if (user.value)
        void run(async () => {
          await refresh();
          await previewInvite();
        });
    });
    const pictureSource = ref("");
    const pictureOriginal = ref("");
    function editGroupPicture() {
      pictureSource.value = pictureOriginal.value || groupPicture.value || "";
    }
    function applyGroupPicture(picture: string) {
      pictureOriginal.value = pictureSource.value;
      groupPicture.value = picture;
      pictureSource.value = "";
    }
    function cancelPictureEditor() {
      pictureSource.value = "";
    }
    const confirmation = ref<Confirmation | null>(null);
    let resolveConfirmation: ((accepted: boolean) => void) | undefined;
    function ask(
      title: string,
      description: string,
      action: string,
    ): Promise<boolean> {
      if (busy.value || confirmation.value) return Promise.resolve(false);
      confirmation.value = { title, description, action };
      return new Promise((resolve) => {
        resolveConfirmation = resolve;
      });
    }
    function answerConfirmation(accepted: boolean) {
      confirmation.value = null;
      resolveConfirmation?.(accepted);
      resolveConfirmation = undefined;
    }
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
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    function dismissMessage() {
      clearTimeout(toastTimer);
      toastTimer = undefined;
      message.value = "";
    }
    function showSuccess(text: string) {
      dismissMessage();
      if (!text) return;
      message.value = text;
      toastTimer = setTimeout(dismissMessage, 4000);
    }
    const tab = ref("groups"),
      groups = ref<Group[]>([]),
      invitations = ref<Invitation[]>([]);
    const group = ref(""),
      members = ref<string[]>([]),
      activities = ref<Activity[]>([]);
    const detail = ref<Activity | null>(null),
      groupName = ref("");
    const menuOpen = ref(false),
      newGroupOpen = ref(false),
      manageGroup = ref(false);
    const editingGroup = ref(""),
      groupPicture = ref<string | null>(null),
      pictureBusy = ref(false),
      pictureError = ref("");
    let groupFormReturn = false,
      pictureVersion = 0;
    const inviteLink = ref("");
    const inviteLinkID = ref("");
    const renamingLink = ref("");
    const inviteLinkName = ref("");
    async function beginRenameLink(link: { link: string; name: string }) {
      inviteLinkName.value = link.name;
      renamingLink.value = link.link;
      await nextTick();
      const input = document.querySelector<HTMLInputElement>("#invite-link-name");
      input?.focus();
      input?.select();
    }
    function saveInviteLinkName() {
      const target = { user: user.value, group: group.value, link: renamingLink.value, name: inviteLinkName.value };
      return run(async () => {
        await answer(client.groups["rename-link"](target));
        renamingLink.value = "";
        await loadInviteLinks();
      }, "Link renamed.");
    }
    const inviteLinks = ref<
      Array<{ link: string; expires: number }>
    >([]);
    const joinToken = ref(
      new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "",
    );
    const joinPreview = ref<{ name: string } | null>(null);
    const sortingGroups = ref(false),
      savingGroupOrder = ref(false),
      orderStatus = ref("");
    let previewAfterAction = false;
    let readRetry: ReturnType<typeof setTimeout> | undefined;
    let readAttempts = 0;
    const capture = ref(""),
      savedActivity = ref("");
    const fields = ref(blank()),
      shareGroups = ref<string[]>([]),
      sharedGroups = ref<string[]>([]);
    const sharingNotice = ref("");
    function applyGroups(next: Group[]) {
      const available = new Set(next.map((item) => item.group));
      if (shareGroups.value.some((id) => !available.has(id))) {
        shareGroups.value = shareGroups.value.filter((id) => available.has(id));
        sharingNotice.value = savedActivity.value
          ? "A selected group is no longer available. Your activity and successful shares are saved. Choose another group or retry the remaining selection."
          : "A selected group is no longer available. Choose where to share below.";
      }
      groups.value = next;
    }
    const allShareGroupsSelected = computed(
      () =>
        groups.value.length > 0 &&
        groups.value.every((item) => shareGroups.value.includes(item.group)),
    );
    function toggleAllShareGroups() {
      shareGroups.value = allShareGroupsSelected.value
        ? groups.value
            .filter((item) => sharedGroups.value.includes(item.group))
            .map((item) => item.group)
        : groups.value.map((item) => item.group);
    }
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
    const findingOptions = ref(false);
    const discoveryPrompt = ref("");
    const discovery = ref<DiscoveryResult["discovery"] | null>(null);
    const discoveryOrder = ref<string[]>([]);
    const discoveryMessage = computed(() => {
      const status = discovery.value?.status;
      return status === "ranked" ? "Ordered for your mood with Gemini. Suggestions are tentative; check the details."
        : status === "unconfigured" ? "AI discovery isn't configured yet. Showing your group's usual options."
        : status === "unavailable" ? (discovery.value?.failureReason === "timeout"
          ? "Gemini took too long to respond. Showing your group’s usual options; you can try again."
          : discovery.value?.failureReason === "invalid_response"
          ? "Gemini couldn’t return a usable ranking. Showing your group’s usual options; you can try again."
          : "AI discovery is unavailable right now. Showing your group’s usual options; you can try again.")
        : "";
    });
    const adjustingPick = ref(false);
    const pickContext = ref<{
      people: string[]; mood: string;
      filters: OnDeckWireHttp["/pick/options"]["output"]["book"]["result"]["filters"];
    } | null>(null);
    const pickSummary = computed(() => {
      const context = pickContext.value;
      if (!context) return [];
      const f = context.filters;
      const labels = [context.people.map(person).join(", ")];
      if (context.mood) labels.push(`Mood: ${context.mood}`);
      if (f.maxCost != null) labels.push(`Up to ${f.maxCost} ${f.currency}`);
      if (f.category) labels.push(`Category: ${f.category}`);
      if (f.location) labels.push(`Location: ${f.location}`);
      if (f.from) labels.push(`From ${new Date(f.from).toLocaleString()}`);
      if (f.until) labels.push(`Until ${new Date(f.until).toLocaleString()}`);
      return labels;
    });
    async function adjustPick() {
      adjustingPick.value = true;
      await nextTick();
      const heading = document.querySelector<HTMLElement>("#pick-people-heading");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start" });
    }
    const picked = ref(false);
    let submittedPick: OnDeckHttpContract["/pick/options"]["input"] | null =
      null;
    const readWarning = ref(""),
      connectionWarning = ref("");
    const syncWarning = computed(
      () => readWarning.value || connectionWarning.value,
    );
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
      dismissMessage();
      try {
        await task();
        showSuccess(success);
      } catch (reason) {
        error.value =
          reason instanceof Error
            ? reason.message
            : "Could not reach the server. Please retry.";
      } finally {
        busy.value = false;
        if (previewAfterAction && user.value) {
          previewAfterAction = false;
          void run(previewInvite);
        }
        if (user.value) requestRefresh();
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
      applyGroups(book.book.groups);
      invitations.value = inbox.inbox.invitations;
      if (!groups.value.some((g) => g.group === group.value))
        group.value = groups.value[0]?.group ?? "";
      await loadGroup();
      await loadNames();
    }
    function clearAccountState() {
      answerConfirmation(false);
      pictureSource.value = "";
      pictureOriginal.value = "";
      group.value = "";
      groups.value = [];
      invitations.value = [];
      sortingGroups.value = false;
      savingGroupOrder.value = false;
      orderStatus.value = "";
      pictureVersion++;
      pictureBusy.value = false;
      editingGroup.value = "";
      groupPicture.value = null;
      pictureError.value = "";
      newGroupOpen.value = false;
      activities.value = [];
      lastNamesAt = 0;
      namesScope = "";
      readWarning.value = "";
      submittedPick = null;
      names.value = {};
      namesWarning.value = "";
      members.value = [];
      detail.value = null;
      participants.value = [];
      options.value = [];
      picked.value = false;
      groupName.value = "";
      error.value = "";
      message.value = "";
      resetCapture();
      manageGroup.value = false;
      inviteLink.value = "";
      inviteLinks.value = [];
      joinPreview.value = null;
      discoveryPrompt.value = "";
      pickContext.value = null;
      adjustingPick.value = false;
      discovery.value = null;
      discoveryOrder.value = [];
      clearTimeout(readRetry);
      readAttempts = 0;
      readWarning.value = "";
      connectionWarning.value = "";
    }
    async function signOut() {
      if (
        (capture.value || fields.value.name) &&
        !(await ask(
          "Sign out?",
          "Your unfinished draft will be lost.",
          "Sign out",
        ))
      )
        return;
      await run(clerkSignOut);
    }
    function beginNewGroup() {
      pictureSource.value = "";
      pictureOriginal.value = "";
      pictureVersion++;
      groupFormReturn = false;
      editingGroup.value = "";
      groupName.value = "";
      groupPicture.value = null;
      pictureError.value = "";
      pictureBusy.value = false;
      newGroupOpen.value = true;
      manageGroup.value = false;
      error.value = "";
    }
    function openEditGroup(id: string) {
      if (busy.value) return;
      const found = groups.value.find((item) => item.group === id);
      if (!found) return;
      pictureSource.value = "";
      pictureOriginal.value = "";
      pictureVersion++;
      groupFormReturn = manageGroup.value;
      editingGroup.value = id;
      groupName.value = found.name;
      groupPicture.value = found.cover;
      pictureError.value = "";
      pictureBusy.value = false;
      newGroupOpen.value = true;
      manageGroup.value = false;
      tab.value = "groups";
      error.value = "";
      window.scrollTo(0, 0);
    }
    function cancelGroupForm() {
      pictureSource.value = "";
      pictureOriginal.value = "";
      pictureVersion++;
      pictureBusy.value = false;
      newGroupOpen.value = false;
      manageGroup.value = groupFormReturn;
      editingGroup.value = "";
      groupName.value = "";
      groupPicture.value = null;
      pictureError.value = "";
    }
    async function chooseGroupPicture(event: Event) {
      const input = event.target as HTMLInputElement,
        file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const version = ++pictureVersion;
      pictureBusy.value = true;
      pictureError.value = "";
      try {
        const picture = await prepareGroupPicture(file);
        if (version === pictureVersion) {
          pictureSource.value = picture;
        }
      } catch (reason) {
        if (version === pictureVersion)
          pictureError.value =
            reason instanceof Error
              ? reason.message
              : "Could not open this picture.";
      } finally {
        if (version === pictureVersion) pictureBusy.value = false;
      }
    }
    async function removeGroupPicture() {
      if (
        !(await ask(
          "Delete group picture?",
          "Save changes to apply this to the group.",
          "Delete picture",
        ))
      )
        return;
      pictureVersion++;
      pictureBusy.value = false;
      pictureError.value = "";
      groupPicture.value = null;
      pictureOriginal.value = "";
    }
    function createGroup() {
      if (pictureBusy.value) return;
      return run(
        async () => {
          const updating = !!editingGroup.value;
          if (!editingGroup.value) {
            const result = await answer(
              client.groups.create({
                user: user.value,
                name: groupName.value.trim(),
              }),
            );
            editingGroup.value = result.group;
            group.value = result.group;
            // Retain the created group even if saving its picture needs a retry.
            await refresh();
          }
          if (updating || groupPicture.value !== null) {
            await answer(
              client.groups.update({
                user: user.value,
                group: editingGroup.value,
                name: groupName.value.trim(),
                cover: groupPicture.value,
              }),
            );
          }
          group.value = editingGroup.value;
          await refresh();
          cancelGroupForm();
        },
        editingGroup.value ? "Group updated." : "Group created.",
      );
    }
    function navigate(next: string) {
      if (newGroupOpen.value) cancelGroupForm();
      window.scrollTo(0, 0);
      tab.value = next;
      menuOpen.value = false;
      manageGroup.value = false;
      detail.value = null;
      if (next === "add" && !shareGroups.value.length && group.value)
        shareGroups.value = [group.value];
      message.value = "";
      error.value = "";
    }
    function switchGroup(id: string) {
      return run(async () => {
        group.value = id;
        await loadGroup();
      });
    }
    function openGroup(id: string) {
      return run(async () => {
        group.value = id;
        await loadGroup();
        navigate("deck");
      });
    }
    async function host<T>(path: string, input: unknown): Promise<T> {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await answer(
        response.json() as Promise<T | { error: string }>,
      );
      if (!response.ok) throw new Error("Please retry.");
      return result as T;
    }
    const inviteUrl = (token: string) => {
      const url = new URL(window.location.origin);
      url.hash = `invite=${token}`;
      return url.href;
    };
    async function loadInviteLinks() {
      inviteLinks.value = (
        await answer(
          client.groups.links({ user: user.value, group: group.value }),
        )
      ).book.links;
    }
    function openMembers(id: string) {
      return run(async () => {
        renamingLink.value = "";
        group.value = id;
        await loadGroup();
        await loadNames();
        await loadInviteLinks();
        tab.value = "groups";
        detail.value = null;
        manageGroup.value = true;
        menuOpen.value = false;
        await nextTick();
        (
          document.querySelector(".group-management h1") as HTMLElement | null
        )?.focus();
        window.scrollTo(0, 0);
      });
    }
    function copyInvite(createNew = false) {
      return run(async () => {
        if (createNew || !inviteLink.value) {
          const result = await answer(
            client.groups["create-link"]({
              user: user.value,
              group: group.value,
            }),
          );
          inviteLinkID.value = result.link;
          inviteLink.value = inviteUrl(result.token);
          await loadInviteLinks();
        }
        try {
          await navigator.clipboard.writeText(inviteLink.value);
        } catch {
          throw new Error(
            "Could not copy the link. Allow clipboard access and try again.",
          );
        }
      }, "Link copied.");
    }
    async function revokeInvite(link: string) {
      if (
        !(await ask(
          "Revoke invitation?",
          "This invite link will no longer work.",
          "Revoke invitation",
        ))
      )
        return;
      return run(async () => {
        await answer(
          client.groups["revoke-link"]({
            user: user.value,
            group: group.value,
            link,
          }),
        );
        if (inviteLinkID.value === link) {
          inviteLink.value = "";
          inviteLinkID.value = "";
        }
        await loadInviteLinks();
      }, "Invitation revoked.");
    }
    async function previewInvite() {
      if (joinToken.value) {
        tab.value = "groups";
        manageGroup.value = false;
        joinPreview.value = await host("/sharing/preview", {
          token: joinToken.value,
        });
      }
    }
    function dismissInvite() {
      joinToken.value = "";
      joinPreview.value = null;
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    function joinGroup() {
      return run(async () => {
        const result = await answer(
          client.invitations["join-link"]({
            user: user.value,
            token: joinToken.value,
          }),
        );
        group.value = result.group;
        dismissInvite();
        await refresh();
        navigate("deck");
      }, "Joined group.");
    }
    async function saveOrder(ids: string[]) {
      if (busy.value || savingGroupOrder.value) return;
      const previous = [...groups.value],
        actor = user.value;
      const byID = new Map(previous.map((group) => [group.group, group]));
      if (
        ids.length !== previous.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !byID.has(id))
      ) {
        requestRefresh();
        return;
      }
      if (ids.every((id, index) => id === previous[index]?.group)) {
        requestRefresh();
        return;
      }
      live.invalidate();
      savingGroupOrder.value = true;
      orderStatus.value = "Saving group order.";
      error.value = "";
      groups.value = ids.map((id) => byID.get(id)!);
      try {
        await answer(client.groups.order({ user: actor, order: ids }));
        if (actor === user.value) orderStatus.value = "Group order saved.";
      } catch (reason) {
        if (actor === user.value) {
          groups.value = previous;
          orderStatus.value = "Group order could not be saved.";
          error.value =
            "Could not save group order. Your previous order was restored.";
        }
      } finally {
        if (actor === user.value) {
          savingGroupOrder.value = false;
          requestRefresh();
        }
      }
    }
    function startGroupDrag() {
      sortingGroups.value = true;
      live.invalidate();
    }
    function finishGroupDrag(ids: string[] | null) {
      sortingGroups.value = false;
      if (ids) void saveOrder(ids);
      else requestRefresh();
    }
    function moveGroup(id: string, offset: number) {
      const ids = groups.value.map((g) => g.group),
        from = ids.indexOf(id),
        to = from + offset;
      if (from < 0 || to < 0 || to >= ids.length) return;
      ids.splice(from, 1);
      ids.splice(to, 0, id);
      return saveOrder(ids);
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
    async function leave() {
      if (
        !(await ask(
          `Leave “${currentGroup.value?.name}”?`,
          "You’ll need an invitation to rejoin.",
          "Leave group",
        ))
      )
        return;
      return run(async () => {
        await answer(
          client.groups.leave({ user: user.value, group: group.value }),
        );
        manageGroup.value = false;
        tab.value = "groups";
        await refresh();
      }, "You left the group.");
    }
    async function deleteGroup(id: string) {
      const name =
        groups.value.find((item) => item.group === id)?.name ?? "this group";
      if (
        !(await ask(
          `Delete “${name}”?`,
          "The group and its invitations will be deleted for everyone. This can’t be undone.",
          "Delete group",
        ))
      )
        return;
      return run(async () => {
        await answer(client.groups.delete({ user: user.value, group: id }));
        manageGroup.value = false;
        tab.value = "groups";
        detail.value = null;
        shareGroups.value = shareGroups.value.filter((group) => group !== id);
        await refresh();
      }, "Group deleted.");
    }
    async function discard() {
      if (
        !(await ask(
          "Discard activity?",
          "Your unfinished activity will be lost.",
          "Discard activity",
        ))
      )
        return;
      return run(async () => {
        if (capture.value)
          await answer(
            client.captures.discard({
              user: user.value,
              capture: capture.value,
            }),
          );
        resetCapture();
      }, "Draft discarded.");
    }
    function resetCapture() {
      sharingNotice.value = "";
      capture.value = "";
      savedActivity.value = "";
      fields.value = blank();
      sharedGroups.value = [];
      shareGroups.value = [];
    }
    function save() {
      return run(async () => {
        if (!shareGroups.value.length)
          throw new Error("Choose at least one group.");
        if (!capture.value) {
          capture.value = (
            await answer(
              client.captures.start({
                user: user.value,
                source: fields.value.source.trim() || fields.value.name.trim(),
              }),
            )
          ).capture;
        }
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
              !(reason instanceof ApiError && reason.code === "CONFLICT")
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
    let detailTrigger: HTMLElement | null = null,
      detailScroll = 0,
      detailReturnName = "";
    function closeDetails() {
      detail.value = null;
      void nextTick(() => {
        window.scrollTo(0, detailScroll);
        const target = detailTrigger?.isConnected
          ? detailTrigger
          : Array.from(
              document.querySelectorAll<HTMLButtonElement>(
                ".workspace button.link",
              ),
            ).find((button) => button.textContent?.trim() === detailReturnName);
        if (target) target.focus({ preventScroll: true });
        else {
          const heading = document.querySelector<HTMLElement>(".workspace h1");
          heading?.setAttribute("tabindex", "-1");
          heading?.focus({ preventScroll: true });
        }
      });
    }
    async function deleteActivity(activity: Activity) {
      const actor = user.value,
        targetGroup = group.value;
      if (activity.suggester !== actor) return;
      if (
        !(await ask(
          `Delete “${activity.name}”?`,
          "This suggestion will be removed from this group. It stays in other groups where it was shared.",
          "Delete suggestion",
        ))
      )
        return;
      if (user.value !== actor || group.value !== targetGroup) return;
      return run(async () => {
        await answer(
          client.activities.withdraw({
            user: actor,
            suggestion: activity.suggestion,
          }),
        );
        await loadGroup();
        await nextTick();
        const heading = document.querySelector<HTMLElement>(".workspace h1");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus();
      }, "Suggestion deleted.");
    }
    function open(activity: Activity) {
      detailTrigger =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches("button.link")
          ? document.activeElement
          : null;
      detailScroll = window.scrollY;
      detailReturnName = activity.name;
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
        await nextTick();
        window.scrollTo(0, 0);
        (
          document.querySelector("#activity-detail-title") as HTMLElement | null
        )?.focus();
      });
    }
    function saveActivity(fields: ActivityEdit, done: () => void) {
      if (!detail.value) return;
      const input = { user: user.value, group: group.value, activity: detail.value.activity };
      return run(async () => {
        await answer(client.activities.update({ ...input, name: fields.name,
          source: optional(fields.source), description: optional(fields.description),
          category: optional(fields.category), location: optional(fields.location),
          cost: fields.cost === "" ? undefined : Number(fields.cost),
          currency: fields.cost === "" ? undefined : optional(fields.currency.trim().toUpperCase()), dateTime: optional(fields.dateTime),
        }));
        done();
        const [book, page] = await Promise.all([
          answer(client.activities.list({ user: input.user, group: input.group })),
          answer(client.activities.get(input)),
        ]);
        if (user.value !== input.user || group.value !== input.group) return;
        activities.value = book.book.activities;
        if (detail.value?.activity === input.activity) detail.value = page.page.activity;
        options.value = [];
        picked.value = false;
      }, "Activity updated.");
    }
    async function update(
      action: "heart" | "complete" | "undo" | "withdraw" | "repeat",
      preference: "UNKNOWN" | "YES" | "NO" = "UNKNOWN",
    ) {
      if (action === "withdraw") {
        if (detail.value) return deleteActivity(detail.value);
        return;
      }
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
        if (action === "repeat")
          await answer(
            client.activities["repeat-preference"]({ ...input, preference }),
          );
        const [book, page] = await Promise.all([
          answer(
            client.activities.list({ user: user.value, group: group.value }),
          ),
          answer(client.activities.get(input)),
        ]);
        activities.value = book.book.activities;
        detail.value = page.page.activity;
        options.value = [];
        picked.value = false;
      });
    }
    function pick() {
      return run(async () => {
        findingOptions.value = true;
        try {
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
          const mood = discoveryPrompt.value.trim();
          let appliedFilters: OnDeckWireHttp["/pick/options"]["output"]["book"]["result"]["filters"] = {};
          let selectedPeople = [...input.participants];
          discovery.value = null;
          discoveryOrder.value = [];
          if (discoveryPrompt.value.trim()) {
            const token = await getToken();
            const response = await fetch("/discovery/options", {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
              body: JSON.stringify({ ...input, prompt: discoveryPrompt.value.trim() }), signal: AbortSignal.timeout(45000),
            });
            const payload = await answer(response.json()) as { book: { result: DiscoveryResult } };
            if (!response.ok) throw new Error("Could not discover activities. Please retry.");
            options.value = payload.book.result.options;
            appliedFilters = payload.book.result.filters;
            selectedPeople = [...payload.book.result.participants];
            discovery.value = payload.book.result.discovery;
            discoveryOrder.value = options.value.map(row => row.activity);
          } else {
            const result = await answer(client.pick.options(input));
            options.value = result.book.result.options;
            appliedFilters = result.book.result.filters;
            selectedPeople = [...result.book.result.participants];
          }
          submittedPick = input;
          pickContext.value = { people: selectedPeople, mood, filters: appliedFilters };
          picked.value = true;
          adjustingPick.value = false;
        } finally { findingOptions.value = false; }
        await nextTick();
        const heading = document.querySelector<HTMLElement>("#pick-results-heading");
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: "start" });
      });
    }
    // Read-only snapshots keep background updates separate from form state and writes.
    const live = createLiveRefresh(
      async () => {
        if (
          !user.value ||
          busy.value ||
          sortingGroups.value ||
          savingGroupOrder.value ||
          document.hidden
        )
          return null;
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
          book.book.groups,
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
        const links =
          manageGroup.value && selectedGroup
            ? (
                await answer(
                  client.groups.links({ user: actor, group: selectedGroup }),
                )
              ).book.links
            : null;
        return {
          links,
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
        if (!snapshot || sortingGroups.value || savingGroupOrder.value) return;
        clearTimeout(readRetry);
        readAttempts = 0;
        const sameGroup = snapshot.previousGroup === snapshot.selectedGroup;
        applyGroups(snapshot.groups);
        if (snapshot.links) {
          inviteLinks.value = snapshot.links;
          if (!snapshot.links.some((link) => link.link === inviteLinkID.value)) {
            inviteLink.value = "";
            inviteLinkID.value = "";
          }
        }
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
          const order = new Map(discoveryOrder.value.map((id, index) => [id, index]));
          options.value = snapshot.options.sort((a, b) => (order.get(a.activity) ?? Infinity) - (order.get(b.activity) ?? Infinity));
          submittedPick = snapshot.pick;
          if (pickContext.value && snapshot.pick) {
            pickContext.value = { ...pickContext.value, people: [...snapshot.pick.participants] };
          }
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
        readWarning.value = "";
      },
      (reason) => {
        clearTimeout(readRetry);
        if (user.value)
          readRetry = setTimeout(
            requestRefresh,
            Math.min(30_000, 1000 * 2 ** Math.min(readAttempts++, 5)),
          );
        readWarning.value =
          reason instanceof ApiError && reason.code === "UNAUTHORIZED"
            ? "Sign in again to resume updates."
            : "Updates paused — reconnecting automatically…";
      },
    );
    function requestRefresh() {
      if (!user.value || document.hidden) return;
      if (busy.value || sortingGroups.value || savingGroupOrder.value) return;
      live.request();
    }
    const connection = createLiveConnection({
      ticket: async () =>
        (await host<{ ticket: string }>("/live/ticket", {})).ticket,
      refresh: requestRefresh,
      status: (value) => {
        connectionWarning.value = value;
      },
      url: () => {
        const url = new URL("/live", window.location.origin);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return url;
      },
    });
    watch(user, () => {
      connection.stop();
      clearTimeout(readRetry);
      if (user.value) connection.start();
    });
    watch(
      group,
      () => {
        live.invalidate();
        manageGroup.value = false;
        inviteLink.value = "";
        inviteLinks.value = [];
      },
      { flush: "sync" },
    );
    function readInviteFragment() {
      const token =
        new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "";
      if (token === joinToken.value) return;
      joinToken.value = token;
      joinPreview.value = null;
      if (user.value && token) {
        if (busy.value) previewAfterAction = true;
        else void run(previewInvite);
      }
    }
    onMounted(() => {
      window.addEventListener("hashchange", readInviteFragment);
      window.addEventListener("focus", requestRefresh);
      document.addEventListener("visibilitychange", requestRefresh);
    });
    onUnmounted(() => {
      dismissMessage();
      connection.stop();
      live.dispose();
      clearTimeout(readRetry);
      window.removeEventListener("hashchange", readInviteFragment);
      window.removeEventListener("focus", requestRefresh);
      document.removeEventListener("visibilitychange", requestRefresh);
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
      pictureSource,
      editGroupPicture,
      applyGroupPicture,
      cancelPictureEditor,
      confirmation,
      answerConfirmation,
      editingGroup,
      groupPicture,
      pictureBusy,
      pictureError,
      beginNewGroup,
      openEditGroup,
      cancelGroupForm,
      chooseGroupPicture,
      removeGroupPicture,
      saveActivity,
      closeDetails,
      deleteActivity,
      switchGroup,
      menuOpen,
      newGroupOpen,
      manageGroup,
      inviteLink,
      inviteLinks,
      renamingLink,
      inviteLinkName,
      beginRenameLink,
      saveInviteLinkName,
      inviteLinkID,
      inviteExpiry: (expires: number) => new Date(expires).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
      joinToken,
      joinPreview,
      navigate,
      openGroup,
      openMembers,
      copyInvite,
      revokeInvite,
      deleteGroup,
      joinGroup,
      dismissInvite,
      moveGroup,
      startGroupDrag,
      finishGroupDrag,
      sortingGroups,
      savingGroupOrder,
      orderStatus,
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
      dismissMessage,
      error,
      tab,
      groups,
      invitations,
      group,
      members,
      activities,
      detail,
      groupName,
      capture,
      savedActivity,
      fields,
      allShareGroupsSelected,
      toggleAllShareGroups,
      shareGroups,
      sharedGroups,
      sharingNotice,
      participants,
      findingOptions,
      adjustingPick,
      pickSummary,
      adjustPick,
      discoveryPrompt,
      discovery,
      discoveryMessage,
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
      invitationAction,
      leave,
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
