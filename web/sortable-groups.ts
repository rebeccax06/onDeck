import Sortable from "sortablejs";
import type { ObjectDirective } from "vue";

type Controls = { disabled: boolean; start: () => void; finish: (order: string[] | null) => void };
type State = { sortable: Sortable; controls: Controls; original: HTMLElement[]; anchor: Node | null; started: boolean; chosen: boolean; disposed: boolean };
const instances = new WeakMap<HTMLElement, State>();

/** Sortable previews placement; Vue remains the owner of the final card order. */
export const sortableGroups: ObjectDirective<HTMLElement, Controls> = {
  mounted(grid, binding) {
    const state: State = { sortable: undefined!, controls: binding.value, original: [], anchor: null, started: false, chosen: false, disposed: false };
    state.sortable = new Sortable(grid, {
      draggable: ".group-card",
      handle: ".drag-handle",
      dataIdAttr: "data-group-id",
      disabled: binding.value.disabled,
      animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 5,
      swapThreshold: 0.65,
      ghostClass: "group-sort-placeholder",
      chosenClass: "group-sort-chosen",
      fallbackClass: "group-sort-preview",
      onChoose() {
        state.original = Array.from(grid.children) as HTMLElement[];
        state.anchor = grid.lastElementChild?.nextSibling ?? null;
        state.chosen = true;
        state.controls.start();
      },
      onStart() { state.started = true; document.body.classList.add("group-sorting"); },
      onUnchoose() {
        if (!state.started && state.chosen && !state.disposed) {
          state.chosen = false;
          state.controls.finish(null);
        }
      },
      onEnd() {
        const order = state.sortable.toArray();
        // Restore the DOM before updating Vue's keyed array; otherwise both would
        // move the same nodes and the visible order could disagree with the data.
        for (const card of state.original) {
          card.style.transform = "";
          card.style.transition = "";
          grid.insertBefore(card, state.anchor);
        }
        state.started = false; state.chosen = false;
        document.body.classList.remove("group-sorting");
        if (!state.disposed) state.controls.finish(order);
      },
    });
    instances.set(grid, state);
  },
  updated(grid, binding) {
    const state = instances.get(grid);
    if (state) { state.controls = binding.value; state.sortable.option("disabled", binding.value.disabled); }
  },
  beforeUnmount(grid) {
    const state = instances.get(grid);
    if (!state) return;
    const active = state.chosen;
    state.disposed = true; state.sortable.destroy();
    document.body.classList.remove("group-sorting");
    if (active) state.controls.finish(null);
    instances.delete(grid);
  },
};
