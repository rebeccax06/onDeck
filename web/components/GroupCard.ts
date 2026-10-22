import { defineComponent, type PropType } from "vue/dist/vue.esm-browser.js";
import type { Group } from "../api.ts";

export const GroupCard = defineComponent({
  props: {
    group: { type: Object as PropType<Group>, required: true },
    person: {
      type: Function as PropType<(id: string) => string>,
      required: true,
    },
  },
  emits: ["open", "members", "move", "delete", "edit"],
  computed: {
    tone(): number {
      return [...this.group.group].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
    },
  },
  template: `<article class="group-card" :data-group-id="group.group">
        <button class="drag-handle" type="button" @keydown.left.prevent="$emit('move', -1)" @keydown.up.prevent="$emit('move', -1)" @keydown.right.prevent="$emit('move', 1)" @keydown.down.prevent="$emit('move', 1)" :aria-label="'Reorder ' + group.name" title="Drag to reorder" aria-describedby="group-reorder-help">
          <svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true"><circle cx="6" cy="5" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="6" cy="11" r="1.7"/><circle cx="12" cy="11" r="1.7"/><circle cx="6" cy="17" r="1.7"/><circle cx="12" cy="17" r="1.7"/></svg>
        </button>
    <button class="card-edit" type="button" @click.stop="$emit('edit')" :aria-label="'Edit ' + group.name" title="Edit group"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg></button>
    <button class="card-delete" type="button" @click.stop="$emit('delete')" :aria-label="'Delete ' + group.name" title="Delete group"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>
    <button class="card-open" @click="$emit('open')" :aria-label="'Open ' + group.name">
      <div class="group-cover" :class="['tone-' + tone, { 'has-image': !!group.cover }]" aria-hidden="true"><img v-if="group.cover" :src="group.cover" alt="" draggable="false" /><template v-else><span></span><i></i></template></div>
      <div class="card-heading"><h3>{{ group.name }}</h3><p>{{ group.members.length }} {{ group.members.length === 1 ? 'member' : 'members' }}</p></div>
    </button>
    <div class="card-footer">
      <div class="avatars" :aria-label="group.members.map(person).join(', ')">
        <span v-for="member in group.members.slice(0,4)" :key="member" class="avatar" :title="person(member)">{{ person(member).slice(0,1).toUpperCase() }}</span>
        <span v-if="group.members.length > 4" class="avatar">+{{ group.members.length - 4 }}</span>
      </div>
      <div class="card-actions">
        <button class="text-button" @click="$emit('members')">Members</button>
      </div>
    </div>
  </article>`,
});
