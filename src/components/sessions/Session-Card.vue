<template>
  <div
    class="relative flex justify-between h-64 overflow-hidden rounded shadow-md rim bg-gray-50 dark:bg-gray-700"
    :style="`border-left: solid 6px ${color}`"
  >
    <div class="flex flex-col w-1/2 h-full lg:w-7/12">
      <!-- <simplebar class="absolute z-30 m-2 mb-0 mr-0 h-9"> -->
      <!-- <div class="h-6 flex flex-nowrap space-x-1.5">
        <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
      </div> -->
      <!-- </simplebar> -->
      <div class="m-4 leading-5">
        <h2 class="mb-4 text-2xl font-medium md:text-4xl dark:text-gray-50">
          <g-link :to="info.path">
            {{ info.title }}
          </g-link>
        </h2>
        <p class="text-gray-600 dark:text-gray-300">
          {{ info.excerpt }}
        </p>
      </div>
    </div>
    <div class="relative w-1/2 h-full overflow-hidden lg:w-5/12">
      <div v-if="info.images[0]">
        <img
          :src="info.images[0].image"
          :alt="info.images[0].alt"
          class="absolute object-cover w-full h-full"
        />
      </div>
      <div v-else class="absolute flex w-full h-full bg-white">
        <h3 class="m-auto text-gray-600">Coming Soon...</h3>
      </div>
    </div>
    <div class="absolute bottom-3 right-3 h-6 flex flex-nowrap space-x-1.5">
      <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
    </div>
  </div>
</template>

<script>
  import TagBadge from '../tags/Tag-Badge.vue';
  // import simplebar from 'simplebar-vue';
  import 'simplebar/dist/simplebar.min.css';
  export default {
    components: {
      TagBadge,
      // simplebar,
    },
    props: {
      info: Object,
    },
    computed: {
      color() {
        return this.info.style[0]?.category.color;
      },
    },
  };
</script>
