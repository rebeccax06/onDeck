import { computed, defineComponent, type PropType } from "vue/dist/vue.esm-browser.js";
import type { Activity } from "../api.ts";

type Preference = "UNKNOWN" | "YES" | "NO";
export const ActivityDetails = defineComponent({
  props: {
    activity: { type: Object as PropType<Activity>, required: true },
    user: { type: String, required: true },
    groupName: { type: String, default: "On Deck" },
    person: { type: Function as PropType<(id: string) => string>, required: true },
    sourceUrl: String,
    costLabel: { type: String, required: true },
  },
  emits: {
    back: () => true,
    delete: () => true,
    action: (_action: "heart" | "complete" | "undo") => true,
    repeat: (_preference: Preference) => true,
  },
  setup(props, { emit }) {
    const own = computed(() => props.activity.members.find(member => member.user === props.user));
    function repeat(event: Event) {
      const value = (event.target as HTMLSelectElement).value;
      if (value === "UNKNOWN" || value === "YES" || value === "NO") emit("repeat", value);
    }
    const date = computed(() => props.activity.dateTime ? new Date(props.activity.dateTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
    return { own, repeat, date };
  },
  template: `<section class="activity-details detail" aria-labelledby="activity-detail-title">
    <button type="button" class="text-button back-button" @click="$emit('back')">← Back to {{ groupName }}</button>
    <div class="activity-detail-layout">
      <section class="activity-information">
        <p v-if="activity.category" class="eyebrow">{{ activity.category }}</p>
        <h1 id="activity-detail-title" tabindex="-1">{{ activity.name }}</h1>
        <p v-if="activity.description" class="activity-description">{{ activity.description }}</p>
        <dl class="activity-facts">
          <div v-if="activity.location"><dt>Location</dt><dd>{{ activity.location }}</dd></div>
          <div><dt>Cost per person</dt><dd>{{ costLabel }}</dd></div>
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
  </section>`,
});
