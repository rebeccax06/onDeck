import { defineComponent } from "vue/dist/vue.esm-browser.js";

export const FormSurface = defineComponent({
  template: `<form class="form-surface"><slot></slot><div v-if="$slots.actions" class="form-footer"><slot name="actions"></slot></div></form>`,
});
