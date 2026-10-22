import { defineComponent, nextTick, ref, watch, type PropType } from "vue/dist/vue.esm-browser.js";

export type Confirmation = { title: string; description: string; action: string };
export const ConfirmDialog = defineComponent({
  props: { prompt: { type: Object as PropType<Confirmation | null>, default: null } },
  emits: { answer: (_accepted: boolean) => true },
  setup(props, { emit }) {
    const dialog = ref<HTMLDialogElement>();
    const cancel = ref<HTMLButtonElement>();
    let trigger: HTMLElement | null = null;
    watch(() => props.prompt, async prompt => {
      if (prompt) {
        trigger = document.activeElement as HTMLElement;
        await nextTick();
        dialog.value?.showModal();
        cancel.value?.focus();
      } else {
        dialog.value?.close();
        if (trigger?.isConnected) trigger.focus();
      }
    });
    return { dialog, cancel, respond: (accepted: boolean) => emit("answer", accepted) };
  },
  template: `<dialog ref="dialog" class="confirm-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" @cancel.prevent="respond(false)">
    <template v-if="prompt"><h2 id="confirmation-title">{{ prompt.title }}</h2><p id="confirmation-description">{{ prompt.description }}</p>
    <div class="dialog-actions"><button ref="cancel" type="button" @click="respond(false)">Cancel</button><button type="button" class="danger-button" @click="respond(true)">{{ prompt.action }}</button></div></template>
  </dialog>`,
});
