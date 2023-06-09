<template>
  <header class="mb-8">
    <h1 :class="`text-${intensitySwitch}xl`"><slot /></h1>
  </header>
</template>

<script>
  export default {
    props: {
      intensity: {
        type: Number,
        default: 3,
      },
    },
    computed: {
      intensitySwitch() {
        return this.intensity === 1 ? '' : this.intensity;
      },
    },
  };
</script>
