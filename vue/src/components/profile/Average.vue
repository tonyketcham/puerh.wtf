<template>
  <span>
    <slot :value="averageYear(years)">
      {{ averageYear(years) }}
    </slot>
  </span>
</template>

<script>
  import { average } from '@/lib/reducers/arithmetic.js';

  export default {
    props: {
      years: Array,
    },
    methods: {
      averageYear(years) {
        return Math.round(average(years));
      },
    },
  };
</script>
