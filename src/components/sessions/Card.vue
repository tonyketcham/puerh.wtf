<template>
  <div
    class="relative flex-shrink-0 overflow-hidden group rounded-2xl w-52 h-96"
    style="scroll-snap-align: center"
  >
    <g-link :to="session.path">
      <g-image
        :alt="session.title"
        :src="session.images[0].image"
        class="absolute inset-0 object-cover w-full h-full"
      />
    </g-link>
    <div
      class="absolute bottom-0 left-0 right-0 w-full pointer-events-none  h-2/3 opacity-90 bg-gradient-to-t from-black to-transparent group-hover:h-3/4"
    ></div>
    <!-- <g-link :to="session.vendor[0].path">
      <g-image
        class="absolute top-0 right-0 object-cover object-center w-8 h-8 m-2 transition-all duration-200 ease-in-out rounded-full opacity-60 filter blur-sm hover:blur-none ring-0 hover:ring-2 ring-white hover:opacity-10"
        :src="session.vendor[0].image"
        :alt="`Vendor: ${session.vendor[0].title}`"
        v-tippy
        :content="`from ${session.vendor[0].title}`"
      />
      <g-image
        class="absolute top-0 right-0 object-cover object-center w-8 h-8 m-2 rounded-full pointer-events-none "
        :src="session.vendor[0].image"
        :alt="`Vendor: ${session.vendor[0].title}`"
        v-tippy
        :content="`${session.vendor[0].title}`"
      />
    </g-link> -->
    <div class="absolute bottom-0 left-0 right-0 p-2">
      <div
        class="h-6 text-xs leading-7 text-gray-200 max-w-max opacity-60"
        style="font-variation-settings: 'LXND' 7"
      >
        <g-link :to="session.vendor[0].path">
          <span>{{ session.vendor[0].title }}</span>
        </g-link>
      </div>
      <div>
        <span
          class="text-xl max-w-max"
          style="font-variation-settings: 'wght' 700"
          :style="`color: ${startColor};`"
          >{{ session.production_year }}</span
        >
        <span class="mx-1 text-gray-200 select-none opacity-40">•</span>
        <span
          class="text-sm text-gray-200 lowercase align-text-top  opacity-60 max-w-max"
          style="font-variation-settings: 'wght' 450, 'LXND' 14"
          >{{ session.style[0].category.title }}</span
        >
      </div>
      <g-link :to="session.path">
        <h2 class="text-2xl font-semibold text-gray-50 line-clamp-2">
          {{ session.title }}
        </h2>
      </g-link>
      <aside class="hidden text-sm text-gray-400 group-hover:block">
        <p>{{ session.excerpt }}</p>
      </aside>
    </div>
  </div>
</template>

<script>
  import { convertToHSL } from '~/lib/utils/color.js';
  export default {
    components: {},
    props: {
      session: Object,
    },
    computed: {
      // color() {
      //   return this.info.style[0]?.category.color;
      // },
      startColor() {
        return convertToHSL(this.session.production_year);
      },
      endColor() {
        return convertToHSL(this.session.production_year);
      },
    },
  };
</script>
