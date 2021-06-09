<template>
  <g-link to="/" class="inline-block font-cursive">
    <div
      @mouseenter="changeFontWeight(700)"
      @mouseleave="changeFontWeight(400)"
      :class="`text-${intensitySwitch}xl`"
      class="transform group uniform-transition max-w-max"
      :style="{ 'font-variation-settings': `'wght' ${fontWeight}` }"
    >
      <h1 class="inline-block">🍵 {{ $static.metadata.siteName }}</h1>
      <span
        class="inline-block transition-transform transform  group-hover:scale-150 group-hover:translate-x-1 group-hover:rotate-3"
        >?</span
      >
    </div>
  </g-link>
</template>

<static-query>
  query {
    metadata {
      siteName
    }
  }
</static-query>

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

    data() {
      return {
        fontWeight: 50,
      };
    },

    methods: {
      changeFontWeight(wght) {
        this.fontWeight = wght;
      },
    },
  };
</script>
