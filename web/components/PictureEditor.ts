import { defineComponent, nextTick, onUnmounted, ref, watch } from "vue/dist/vue.esm-browser.js";

export const PictureEditor = defineComponent({
  props: { source: { type: String, default: "" } },
  emits: { apply: (_picture: string) => true, cancel: () => true },
  setup(props, { emit }) {
    const dialog = ref<HTMLDialogElement>(), canvas = ref<HTMLCanvasElement>();
    const zoom = ref(1), horizontal = ref(50), vertical = ref(50), rotation = ref(0);
    const ready = ref(false), error = ref("");
    let image: HTMLImageElement | null = null, trigger: HTMLElement | null = null;
    let generation = 0;
    let drag: { id: number; x: number; y: number; horizontal: number; vertical: number } | null = null;
    function dimensions() {
      if (!image) return { width: 960, height: 480 };
      const sideways = rotation.value % 180 !== 0;
      const width = sideways ? image.naturalHeight : image.naturalWidth;
      const height = sideways ? image.naturalWidth : image.naturalHeight;
      const scale = Math.max(960 / width, 480 / height) * zoom.value;
      return { width: width * scale, height: height * scale };
    }
    function draw() {
      const context = canvas.value?.getContext("2d");
      if (!image || !context || !ready.value) return;
      const { width, height } = dimensions();
      context.save();
      context.fillStyle = "#f2f6ef"; context.fillRect(0, 0, 960, 480);
      context.translate(480 + (50 - horizontal.value) / 100 * (width - 960), 240 + (50 - vertical.value) / 100 * (height - 480));
      context.rotate(rotation.value * Math.PI / 180);
      const sideways = rotation.value % 180 !== 0;
      const drawWidth = sideways ? height : width, drawHeight = sideways ? width : height;
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
    }
    function reset() { zoom.value = 1; horizontal.value = 50; vertical.value = 50; rotation.value = 0; draw(); }
    function rotate() { rotation.value = (rotation.value + 90) % 360; horizontal.value = 50; vertical.value = 50; draw(); }
    function start(event: PointerEvent) {
      if (!ready.value || event.button !== 0) return;
      canvas.value?.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: horizontal.value, vertical: vertical.value };
    }
    function move(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId || !canvas.value) return;
      const rect = canvas.value.getBoundingClientRect(), { width, height } = dimensions();
      const clamp = (value: number) => Math.max(0, Math.min(100, value));
      if (width > 960) horizontal.value = clamp(drag.horizontal - (event.clientX - drag.x) * 960 / rect.width / (width - 960) * 100);
      if (height > 480) vertical.value = clamp(drag.vertical - (event.clientY - drag.y) * 480 / rect.height / (height - 480) * 100);
      draw();
    }
    function apply() {
      if (!ready.value || !canvas.value) return;
      draw();
      const cover = canvas.value.toDataURL("image/jpeg", .82);
      if (cover.length > 350000) { error.value = "This picture is too detailed. Try zooming in or choosing another picture."; return; }
      emit("apply", cover);
    }
    watch([zoom, horizontal, vertical], draw);
    watch(() => props.source, async source => {
      const current = ++generation;
      ready.value = false; error.value = ""; image = null; drag = null;
      if (!source) { dialog.value?.close(); if (trigger?.isConnected) trigger.focus(); return; }
      trigger = document.activeElement as HTMLElement;
      await nextTick();
      if (current !== generation) return;
      dialog.value?.showModal();
      const loaded = new Image();
      loaded.onload = () => { if (current !== generation) return; image = loaded; ready.value = true; reset(); };
      loaded.onerror = () => { if (current === generation) error.value = "This picture couldn't be opened. Choose another file."; };
      loaded.src = source;
    });
    onUnmounted(() => { generation++; image = null; });
    return { dialog, canvas, zoom, horizontal, vertical, ready, error, rotate, reset, start, move, stop: () => { drag = null; }, apply };
  },
  template: `<dialog ref="dialog" class="picture-editor" aria-labelledby="picture-editor-title" @cancel.prevent="$emit('cancel')">
    <h2 id="picture-editor-title">Edit picture</h2>
    <p class="hint">Drag to reposition.</p>
    <canvas ref="canvas" width="960" height="480" aria-label="Group picture crop preview" @pointerdown="start" @pointermove="move" @pointerup="stop" @pointercancel="stop" @lostpointercapture="stop"></canvas>
    <fieldset :disabled="!ready" class="crop-controls">
      <label>Zoom<input aria-label="Zoom" v-model.number="zoom" type="range" min="1" max="3" step="0.01" /></label>
      <div class="row"><label>Horizontal position<input aria-label="Horizontal position" v-model.number="horizontal" type="range" min="0" max="100" /></label><label>Vertical position<input aria-label="Vertical position" v-model.number="vertical" type="range" min="0" max="100" /></label></div>
      <div class="heading-actions"><button type="button" @click="rotate">Rotate</button><button type="button" @click="reset">Reset</button></div>
    </fieldset>
    <p v-if="error" class="error field-error" role="alert">{{ error }}</p>
    <div class="form-footer"><button type="button" @click="$emit('cancel')">Cancel</button><button type="button" class="primary" :disabled="!ready" @click="apply">Apply crop</button></div>
  </dialog>`,
});
