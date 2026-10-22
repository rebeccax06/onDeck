import { computed, defineComponent, type PropType } from "vue/dist/vue.esm-browser.js";
import type { Activity } from "../api.ts";

export const ActivityCard = defineComponent({
  props: {
    activity: { type: Object as PropType<Activity>, required: true },
    user: { type: String, required: true },
    person: { type: Function as PropType<(id: string) => string>, required: true },
  },
  emits: {
    open: (_activity: Activity) => true,
    heart: (_activity: Activity) => true,
    delete: (_activity: Activity) => true,
  },
  setup(props) {
    const wanted = computed(() => props.activity.interestedMembers.includes(props.user));
    const metadata = computed(() => [props.activity.location,
      props.activity.cost == null ? "Cost unknown" : `${props.activity.cost} ${props.activity.currency ?? ""}`,
    ].filter(Boolean).join(" · "));
    return { wanted, metadata };
  },
  template: `
    <article class="activity-card" :data-suggestion="activity.suggestion">
      <button v-if="activity.suggester===user" type="button" class="activity-delete" @click.stop="$emit('delete', activity)" :aria-label="'Delete ' + activity.name" title="Delete suggestion"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>
      <p v-if="activity.category" class="eyebrow">{{ activity.category }}</p>
      <h3><button class="link" @click="$emit('open', activity)">{{ activity.name }}</button></h3>
      <p class="metadata">{{ metadata }}</p>
      <div class="activity-footer">
        <button class="heart-toggle" @click="$emit('heart', activity)" :aria-pressed="wanted"
          :aria-label="(wanted ? 'Remove interest in ' : 'Want to do ') + activity.name">{{ wanted ? '♥ Want to do' : '♡ Want to do' }}</button>
        <span>{{ activity.interestedMembers.map(person).join(', ') || 'No hearts yet' }}</span>
        <span>{{ activity.completedMembers.length }} have been</span>
      </div>
    </article>`,
});
