<template>
  <div
    class="relative flex justify-between overflow-x-hidden transition-colors duration-100 ease-in-out rounded shadow-xl min-h-48 bg-gray-50 dark:bg-gray-200 ring-1 ring-offset-2 ring-gray-800 ring-opacity-10"
  >
    <div class="flex flex-col h-full lg:w-7/12">
      <!-- <simplebar class="absolute z-30 m-2 mb-0 mr-0 h-9"> -->
      <!-- <div class="h-6 flex flex-nowrap space-x-1.5">
        <TagBadge v-for="tag in info.tags" :key="tag.title" :tag="tag" />
      </div> -->
      <!-- </simplebar> -->
      <div
        v-if="info.images[0]"
        class="absolute overflow-hidden rounded-sm inset-2"
      >
        <img
          :src="info.images[0].image"
          :loading="index > 5 ? 'lazy' : 'eager'"
          :alt="info.images[0].alt"
          class="object-cover w-full h-full"
        />
        <div
          class="absolute inset-0 w-full h-full opacity-90 bg-gradient-to-r from-gray-900 to-transparent"
        />
      </div>
      <div class="w-10 h-1" :style="`background-color: ${color}`" />
      <div
        class="absolute bottom-0 right-0 w-10 h-1"
        :style="`background-color: ${color}`"
      />

      <div
        class="absolute m-4 leading-3 divide-y-2 divide-gray-100 divide-opacity-50"
      >
        <div class="py-1">
          <h2
            class="mb-0 font-sans text-4xl font-semibold tracking-tight"
            :class="[info.images[0] ? 'text-gray-50' : 'text-gray-700']"
          >
            <g-link :to="info.path">
              {{ info.title }}
            </g-link>
          </h2>
          <small
            class="ml-1.5 font-semibold tracking-wider"
            :class="[info.images[0] ? 'text-gray-300' : 'text-gray-600']"
            >{{ info.date }}
          </small>
        </div>
        <div class="flex-wrap w-80">
          <p
            class="ml-1.5 mt-2 text-lg max-w-max px-1"
            :class="[
              info.images[0] ? 'text-gray-200 text-shadow-md' : 'text-gray-600',
            ]"
          >
            {{ info.excerpt }}
          </p>
        </div>
      </div>
      <div
        class="absolute top-3 right-3 h-6 hidden md:flex flex-row flex-nowrap space-x-1.5"
      >
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
