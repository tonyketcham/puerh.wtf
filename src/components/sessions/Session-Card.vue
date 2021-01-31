<template>
  <div
    class="flex justify-between h-56 overflow-hidden rounded-lg rim border-opacity-20 bg-gray-50 dark:bg-gray-700"
    :style="`border-left: solid 3.5px ${color}`"
  >
    <div class="flex flex-col w-1/2 h-full md:w-2/3">
      <simplebar class="m-2 mb-0 mr-0 h-9">
        <div class="h-6 flex flex-nowrap space-x-1.5">
          <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
        </div>
      </simplebar>
      <div class="m-4">
        <h2 class="text-2xl md:text-3xl">
          <g-link :to="info.path">
            {{ info.title }}
          </g-link>
        </h2>
        <p class="text-gray-600 dark:text-gray-300">
          {{ info.excerpt }}
        </p>
      </div>
    </div>
    <div class="w-1/2 h-full overflow-hidden shadow-md md:w-1/3">
      <img
        v-if="info.images[0]"
        :src="info.images[0].image"
        :alt="info.images[0].alt"
        class="object-cover w-full h-full"
      />
      <div v-else class="flex w-full h-full bg-white">
        <h3 class="m-auto text-gray-600">Coming Soon...</h3>
      </div>
    </div>
  </div>
</template>

<script>
  import TagBadge from '../tags/Tag-Badge.vue';
  import simplebar from 'simplebar-vue';
  import 'simplebar/dist/simplebar.min.css';
  export default {
    components: {
      TagBadge,
      simplebar,
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
