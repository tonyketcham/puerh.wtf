<template>
  <ul
    class="p-6 space-y-2 border-2 border-gray-700 rounded-md w-36 dark:border-gray-200"
  >
    <li
      v-for="(axis, index) of flavor_axes"
      :key="index"
      class="font-mono text-sm font-semibold uppercase"
    >
      {{ index | formatText }}
      <dl
        class="ml-2 text-xs font-normal text-gray-500 lowercase dark:text-gray-300"
      >
        <div
          v-for="(point, index) of axis"
          :key="index"
          class="flex flex-row justify-between"
        >
          <dt>{{ index }}</dt>
          <dd>{{ point }}</dd>
        </div>
      </dl>
    </li>
  </ul>
</template>

<script>
  export default {
    props: {
      flavor_axes: {
        type: Object,
        default() {
          return {
            cream: {
              start: 4,
              finish: 2,
            },
            umami: {
              start: 7,
              finish: 7,
            },
            stone: {
              start: 4,
              finish: 4,
            },
            spices: {
              start: 4,
              finish: 5,
            },
            earth: {
              start: 4,
              finish: 4,
            },
            nuts_roast: {
              start: 3,
              finish: 5,
            },
            wood: {
              start: 6,
              finish: 4,
            },
            vegetal: {
              start: 4,
              finish: 6,
            },
            floral: {
              start: 4,
              finish: 4,
            },
            fruits: {
              start: 6,
              finish: 3,
            },
          };
        },
      },
    },
    filters: {
      formatText(string) {
        return string.replaceAll('_', '/');
      },
    },
  };
</script>
