import { computed, defineComponent, ref, nextTick, type PropType } from "vue/dist/vue.esm-browser.js";
import type { Activity } from "../api.ts";

export type ActivityEdit = { name: string; source: string; description: string; category: string; location: string; cost: string; currency: string; dateTime: string };

type Preference = "UNKNOWN" | "YES" | "NO";
export const ActivityDetails = defineComponent({
  props: {
    busy: Boolean,
    activity: { type: Object as PropType<Activity>, required: true },
    user: { type: String, required: true },
    groupName: { type: String, default: "On Deck" },
    person: { type: Function as PropType<(id: string) => string>, required: true },
    sourceUrl: String,
    costLabel: { type: String, required: true },
  },
  emits: {
    save: (_fields: ActivityEdit, _done: () => void) => true,
    back: () => true,
    delete: () => true,
    action: (_action: "heart" | "complete" | "undo") => true,
    repeat: (_preference: Preference) => true,
  },
  setup(props, { emit }) {
    const editing = ref(false);
    const draft = ref<ActivityEdit>({ name: "", source: "", description: "", category: "", location: "", cost: "", currency: "USD", dateTime: "" });
    let originalDate = "";
    let originalLocalDate = "";
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    async function beginEdit() {
      const row = props.activity;
      originalDate = row.dateTime ?? "";
      const instant = originalDate ? new Date(originalDate) : null;
      originalLocalDate = instant ? new Date(instant.getTime() - instant.getTimezoneOffset() * 60000).toISOString().slice(0, 19) : "";
      draft.value = { name: row.name, source: row.source ?? "", description: row.description ?? "",
        category: row.category ?? "", location: row.location ?? "", cost: row.cost == null ? "" : String(row.cost),
        currency: row.currency ?? "USD", dateTime: originalLocalDate };
      editing.value = true;
      await nextTick();
      document.querySelector<HTMLElement>("#activity-edit-name")?.focus();
    }
    async function finishEdit() {
      editing.value = false;
      await nextTick();
      document.querySelector<HTMLElement>("#activity-detail-title")?.focus();
    }
    function save() {
      const local = draft.value.dateTime;
      const dateTime = local === originalLocalDate ? originalDate : local ? new Date(local).toISOString() : "";
      emit("save", { ...draft.value, dateTime }, () => { void finishEdit(); });
    }
    const hasDetails = computed(() => !!(props.activity.description?.trim() || props.activity.category?.trim() || props.activity.location?.trim() || props.activity.source?.trim() || props.activity.dateTime || props.activity.cost != null));
    const own = computed(() => props.activity.members.find(member => member.user === props.user));
    function repeat(event: Event) {
      const value = (event.target as HTMLSelectElement).value;
      if (value === "UNKNOWN" || value === "YES" || value === "NO") emit("repeat", value);
    }
    const date = computed(() => props.activity.dateTime ? new Date(props.activity.dateTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
    return { own, repeat, date, timeZone, hasDetails, editing, draft, beginEdit, finishEdit, save };
  },
  template: `<section class="activity-details detail" :aria-labelledby="editing ? 'activity-edit-title' : 'activity-detail-title'">
    <template v-if="editing">
      <button type="button" class="text-button back-button" @click="finishEdit" :disabled="busy">← Back to activity</button>
      <h1 id="activity-edit-title">Edit activity</h1>
      <p class="hint">Changes apply to every group sharing this activity.</p>
      <form class="form-surface activity-edit-form" @submit.prevent="save">
        <fieldset :disabled="busy" class="form-section">
          <legend>Activity details</legend>
          <label for="activity-edit-name">Name<input id="activity-edit-name" v-model="draft.name" required /></label>
          <label>Link<input v-model="draft.source" /></label>
          <label>Description<textarea v-model="draft.description"></textarea></label>
          <div class="row"><label>Category<input v-model="draft.category" /></label><label>Location<input v-model="draft.location" /></label></div>
          <div class="row"><label>Cost per person<input v-model="draft.cost" type="number" min="0" step="any" placeholder="Unknown" /></label><label>Currency<input v-model="draft.currency" maxlength="3" :required="draft.cost!==''" /></label></div>
          <label>Date and time<input v-model="draft.dateTime" type="datetime-local" step="1" aria-describedby="activity-edit-timezone" /></label>
          <p id="activity-edit-timezone" class="hint">Your timezone: {{ timeZone }}. Leave blank if you haven’t picked a time.</p>
        </fieldset>
        <div class="form-footer"><button type="button" @click="finishEdit" :disabled="busy">Cancel</button><button type="submit" class="primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save changes' }}</button></div>
      </form>
    </template>
    <template v-else>
    <button type="button" class="text-button back-button" @click="$emit('back')">← Back to {{ groupName }}</button>
    <div class="activity-detail-layout">
      <section class="activity-information">
        <p v-if="activity.category" class="eyebrow">{{ activity.category }}</p>
        <div class="activity-information-heading">
          <h1 id="activity-detail-title" tabindex="-1">{{ activity.name }}</h1>
          <button type="button" class="text-button" @click="beginEdit" :disabled="busy">Edit activity</button>
        </div>
        <p v-if="activity.description" class="activity-description">{{ activity.description }}</p>
        <p v-if="!hasDetails" class="activity-empty-details hint">Details not added yet. Add a description, place, or price with Edit activity.</p>
        <dl v-if="activity.location || activity.cost!=null || date" class="activity-facts">
          <div v-if="activity.location"><dt>Location</dt><dd>{{ activity.location }}</dd></div>
          <div v-if="activity.cost!=null"><dt>Cost per person</dt><dd>{{ costLabel }}</dd></div>
          <div v-if="date"><dt>When</dt><dd>{{ date }}</dd></div>
        </dl>
        <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="source-link">Open original link ↗</a>
        <p v-else-if="activity.source" class="activity-source">{{ activity.source }}</p>
        <p class="suggested-by">Suggested by {{ person(activity.suggester) }}</p>
      </section>
      <section class="interest-panel" aria-labelledby="my-interest-heading">
        <h2 id="my-interest-heading">My interest</h2>
        <button type="button" class="detail-heart" :aria-pressed="!!own?.wanted" @click="$emit('action','heart')">{{ own?.wanted ? '♥ Want to do' : '♡ Want to do' }}</button>
        <button v-if="!own?.completed" type="button" @click="$emit('action','complete')">I've done this</button>
        <template v-else><p class="completion-status">✓ You’ve done this</p><label>Would you do it again?<select :value="own.repeatPreference" @change="repeat"><option value="UNKNOWN">Not sure</option><option value="YES">Yes</option><option value="NO">No</option></select></label><button type="button" class="text-button" @click="$emit('action','undo')">Undo completion</button></template>
      </section>
    </div>
    <section class="activity-group-interest" aria-labelledby="group-interest-heading">
      <h2 id="group-interest-heading">Group interest <span class="count">{{ activity.members.length }}</span></h2>
      <ul class="activity-member-list"><li v-for="member in activity.members" :key="member.user">
        <span class="avatar" aria-hidden="true">{{ person(member.user).slice(0,1).toUpperCase() }}</span><span class="activity-member-name">{{ person(member.user) }}<span v-if="member.user===user" class="you-badge">You</span></span>
        <span class="member-interest" :class="{ interested: member.wanted }">{{ member.wanted ? '♥ Wants to do' : 'No interest marked' }}</span>
        <span class="member-experience">{{ member.completed ? (member.repeatPreference==='YES' ? 'Has been · would go again' : member.repeatPreference==='NO' ? 'Has been · wouldn’t repeat' : 'Has been') : 'Hasn’t been yet' }}</span>
      </li></ul>
    </section>
    <div v-if="activity.suggester===user" class="activity-detail-danger"><button type="button" class="danger-outline" @click="$emit('delete')">Delete suggestion</button></div>
    </template>
  </section>`,
});
