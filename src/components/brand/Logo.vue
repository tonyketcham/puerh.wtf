<template>
  <h1 class="inline-block font-black" :class="`text-${intensitySwitch}xl`">
    <g-link to="/"> 🌱 puerh.wtf </g-link>
  </h1>
</template>

<script>
  export default {
    props: {
      intensity: {
        type: Number,
        default: 2,
      },
    },

    computed: {
      intensitySwitch() {
        return this.intensity === 1 ? '' : this.intensity;
      },
    },
  };
</script>
