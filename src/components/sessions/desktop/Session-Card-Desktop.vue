<template>
  <tr
    class="h-24 overflow-hidden transition-colors duration-100 ease-in-out rounded-md shadow-sm"
  >
    <!-- <simplebar class="absolute z-30 m-2 mb-0 mr-0 h-9"> -->
    <!-- <div class="h-6 flex flex-nowrap space-x-1.5">
        <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
      </div> -->
    <!-- </simplebar> -->
    <td>
      <div class="flex space-x-2">
        <g-link
          :to="info.path"
          v-if="info.images[0]"
          class="flex-shrink-0 w-20 h-20 my-auto"
        >
          <g-image
            blur="40px"
            :src="info.images[0].image"
            :loading="index > 5 ? 'lazy' : 'eager'"
            :alt="info.images[0].alt"
            class="object-cover object-center w-full h-full transform rounded ring-0 ring-green-700 hover:scale-110"
          />
        </g-link>
        <g-link
          class="self-center text-lg font-medium tracking-wide text-gray-800 dark:text-gray-100"
          :to="info.path"
        >
          {{ info.title }}
        </g-link>
      </div>
    </td>
    <!-- <td class="w-2" :style="`background-color: ${color}`" /> -->
    <td class="text-xs font-semibold tracking-wide">
      {{ info.date }}
    </td>
    <td class="mt-2 text-lg tracking-wide">
      <!-- {{ info.excerpt }} -->
    </td>
    <td class="">
      <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
    </td>
  </tr>
</template>

<script>
  export default {
    components: {
      TagBadge: () => import('@/components/tags/Tag-Badge.vue'),
    },
    props: {
      info: Object,
      index: Number,
    },
    computed: {
      color() {
        return this.info.style[0]?.category.color;
      },
    },
  };
</script>

<style lang="scss" scoped>
  td {
    @apply py-2 px-3 bg-white dark:bg-gray-800;
  }
  td:first-child {
    @apply rounded-l-md;
  }
  td:last-child {
    @apply rounded-r-md;
  }
</style>
