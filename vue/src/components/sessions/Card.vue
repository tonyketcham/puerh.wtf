<template>
  <div
    class="relative flex-shrink-0 h-full overflow-hidden border-2 border-gray-800  group rounded-2xl w-52 max-h-96"
    style="scroll-snap-align: center"
  >
    <g-link :to="session.path">
      <div class="absolute inset-0 w-full h-full">
        <g-image
          :alt="session.title"
          :src="session.images[0].image"
          blur="80"
          width="208"
          height="384"
          class="object-cover w-full h-full"
        />
      </div>
    </g-link>
    <div
      class="absolute bottom-0 left-0 right-0 w-full pointer-events-none  h-2/3 bg-gradient-to-t from-black to-transparent group-hover:h-3/4"
    ></div>
    <div class="absolute bottom-0 left-0 right-0 flex flex-col p-2">
      <span
        class="text-xl max-w-max text-shadow-xl"
        style="font-variation-settings: 'wght' 600, 'LXND' 16"
        :style="`color: ${startColor};`"
      >
        {{ session.production_year }}
      </span>
      <g-link :to="session.path">
        <h2 class="text-2xl font-semibold text-gray-50 line-clamp-2">
          {{ session.title }}
        </h2>
      </g-link>
      <div
        class="inline text-xs leading-7 text-gray-800 max-w-max"
        style="font-variation-settings: 'LXND' 7"
      >
        <g-link :to="session.vendor[0].path">
          <span class="bg-primary-light text-padding">{{
            session.vendor[0].title
          }}</span>
        </g-link>
      </div>
      <span
        class="text-sm text-gray-800 lowercase align-text-top  max-w-max bg-primary-light text-padding"
        style="font-variation-settings: 'wght' 450, 'LXND' 14"
        >{{ session.style[0].category.title }}</span
      >
      <aside class="hidden text-sm text-gray-800 group-hover:block">
        <p class="inline bg-primary-light max-w-max text-padding">
          {{ session.excerpt }}
        </p>
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

<style>
  .text-padding {
    box-shadow: -7px 0 0 rgba(254, 244, 232), 7px 0 0 rgba(254, 244, 232);
  }
</style>
