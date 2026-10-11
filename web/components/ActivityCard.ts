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
  },
  setup(props) {
    const wanted = computed(() => props.activity.interestedMembers.includes(props.user));
    const metadata = computed(() => [props.activity.location,
      props.activity.cost == null ? "Cost unknown" : `${props.activity.cost} ${props.activity.currency ?? ""}`,
    ].filter(Boolean).join(" · "));
    return { wanted, metadata };
  },
  template: `
    <article>
      <p class="eyebrow">{{ activity.category || 'SOMETHING TO LOOK FORWARD TO' }}</p>
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
