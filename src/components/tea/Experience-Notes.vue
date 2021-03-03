<template>
  <dl class="w-1/2 space-y-4">
    <div>
      <dt class="w-full font-semibold border-b-2">Wet leaf nose</dt>
      <dd>{{ notes.wet_leaf_nose }}</dd>
    </div>
    <div>
      <dt class="w-full font-semibold border-b-2">Dry leaf nose</dt>
      <dd>{{ notes.dry_leaf_nose }}</dd>
    </div>
    <div>
      <dt class="w-full font-semibold border-b-2">Mouthfeel</dt>
      <dd>{{ notes.mouthfeel }}</dd>
    </div>
    <div>
      <dt class="w-full font-semibold border-b-2">Taste</dt>
      <dd>{{ notes.taste }}</dd>
    </div>
    <div>
      <dt class="w-full font-semibold border-b-2">Finish</dt>
      <dd>{{ notes.finish }}</dd>
    </div>
    <div>
      <dt class="w-full font-semibold border-b-2">Empty Cup</dt>
      <dd>{{ notes.empty_cup }}</dd>
    </div>
    <div>
      <dt class="w-full font-semibold border-b-2">Feeling</dt>
      <dd>{{ notes.cha_qi }}</dd>
    </div>
  </dl>
</template>

<script>
  export default {
    props: {
      notes: {
        type: Object,
      },
    },
  };
</script>
