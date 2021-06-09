<template>
  <div
    class="relative flex justify-between w-full h-40 overflow-hidden transition-all duration-200 ease-in-out rounded-sm shadow-md  bg-gray-50 dark:bg-black ring-2 ring-offset-2 ring-offset-gray-50 dark:ring-offset-black ring-gray-700 dark:ring-gray-300 group"
  >
    <div class="flex flex-col h-full lg:w-7/12">
      <div
        v-if="info.images[0]"
        class="absolute overflow-hidden rounded-sm inset-2"
      >
        <img
          :src="info.images[0].image"
          :loading="index > 5 ? 'lazy' : 'eager'"
          :alt="info.images[0].alt"
          class="inline-block object-cover w-full h-full transition-transform  transform-gpu group-hover:scale-110"
        />
        <div
          class="absolute inset-0 w-full h-full  opacity-60 bg-gradient-to-br from-gray-900 to-transparent"
        />
      </div>
      <div class="w-10 h-1" :style="`background-color: ${color}`" />
      <div
        class="absolute bottom-0 right-0 w-10 h-1"
        :style="`background-color: ${color}`"
      />

      <div class="absolute m-4 leading-5">
        <h2
          class="mb-2 text-4xl font-medium font-cursive"
          :class="[
            info.images[0] ? 'text-gray-50' : 'text-gray-700 dark:text-gray-50',
          ]"
        >
          <g-link :to="info.path">
            {{ info.title }}
          </g-link>
        </h2>
        <small
          class="font-semibold tracking-wider"
          :class="[info.images[0] ? 'text-gray-300' : 'text-gray-600']"
          >{{ info.date }}
        </small>
        <p
          class="mt-2 text-lg tracking-wide"
          :class="[
            info.images[0] ? 'text-gray-200 text-shadow-md' : 'text-gray-600',
          ]"
        >
          {{ info.excerpt }}
        </p>
      </div>
      <div class="absolute bottom-3 right-3 h-6 flex flex-nowrap space-x-1.5">
        <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
      </div>
    </div>
  </div>
</template>

<script>
  export default {
    components: {
      TagBadge: () => import('../tags/Tag-Badge.vue'),
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
