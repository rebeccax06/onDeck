import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, useId, watch, type PropType } from "vue/dist/vue.esm-browser.js";
import type { Group } from "../api.ts";

export const GroupPicker = defineComponent({
  props: {
    groups: { type: Array as PropType<Group[]>, required: true },
    value: { type: String, required: true },
    disabled: Boolean,
  },
  emits: { change: (_id: string) => true },
  setup(props, { emit }) {
    const root = ref<HTMLElement>(), trigger = ref<HTMLButtonElement>(), open = ref(false);
    const menuId = useId();
    const selected = computed(() => props.groups.find(group => group.group === props.value));
    const rows = () => Array.from(root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    async function show(last = false) {
      if (props.disabled || !props.groups.length) return;
      open.value = true;
      await nextTick();
      const buttons = rows();
      (last ? buttons.at(-1) : buttons[props.groups.findIndex(group => group.group === props.value)] ?? buttons[0])?.focus();
    }
    function close(restore = false) { open.value = false; if (restore) trigger.value?.focus(); }
    function choose(id: string) { close(true); if (id !== props.value) emit("change", id); }
    function keys(event: KeyboardEvent) {
      const buttons = rows(), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }
    function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) close(); }
    function focusout(event: FocusEvent) { if (!root.value?.contains(event.relatedTarget as Node)) close(); }
    watch(() => props.disabled, disabled => { if (disabled) close(); });
    watch(() => props.value, () => close());
    onMounted(() => document.addEventListener("pointerdown", outside));
    onUnmounted(() => document.removeEventListener("pointerdown", outside));
    return { root, trigger, open, menuId, selected, show, close, choose, keys, focusout };
  },
  template: `<div ref="root" class="group-picker" @focusout="focusout">
    <button ref="trigger" type="button" class="group-picker-trigger" aria-label="Switch group" aria-haspopup="menu" :aria-expanded="open" :aria-controls="menuId" :disabled="disabled || !groups.length" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show(true)">
      <span class="group-thumbnail" aria-hidden="true"><img v-if="selected?.cover" :src="selected.cover" alt="" /><span v-else>{{ selected?.name.slice(0,1).toUpperCase() || 'G' }}</span></span>
      <span class="group-picker-name">{{ selected?.name || 'Choose group' }}</span>
      <svg class="picker-chevron" :class="{ expanded: open }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <div v-if="open" :id="menuId" role="menu" aria-label="Groups" class="group-picker-menu" @keydown="keys">
      <button v-for="group in groups" :key="group.group" role="menuitemradio" tabindex="-1" :aria-checked="group.group===value" type="button" @click="choose(group.group)">
        <span class="group-thumbnail" aria-hidden="true"><img v-if="group.cover" :src="group.cover" alt="" /><span v-else>{{ group.name.slice(0,1).toUpperCase() }}</span></span>
        <span class="group-picker-name">{{ group.name }}</span>
        <svg v-if="group.group===value" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
      </button>
    </div>
  </div>`,
});
