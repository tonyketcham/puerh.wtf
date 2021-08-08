<template>
  <section class="relative w-full h-96">
    <div
      class="absolute flex w-full space-x-3 overflow-x-scroll overflow-y-hidden  no-scrollbar"
      style="
        scroll-behavior: smooth;
        scroll-snap-points-x: repeat(100%);
        scroll-snap-type: x proximity;
      "
      ref="scrollPane"
      @scroll="scrollObserver"
    >
      <slot />
      <g-link class="font-semibold" :to="seeMoreLink">
        <div
          class="flex justify-center w-40 place-items-center rounded-2xl h-96"
          style="scroll-snap-align: center"
          ref="end"
        >
          <div class="flex flex-col text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              display="block"
              id="Grid"
              class="m-auto"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>See More</span>
          </div>
        </div>
      </g-link>
    </div>
    <div
      class="absolute top-0 bottom-0 z-50 flex h-full text-lg align-middle  -left-8"
    >
      <button class="m-auto group" @click="scrollLeft(false)">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          display="block"
          id="TriangleLeft"
          class="fill-[transparent] transition-colors ease-in-out"
          :class="{
            'group-hover:fill-current': !disableLeft,
            'text-gray-300': disableLeft,
          }"
        >
          <path d="M7 12l8-6v12l-8-6z" />
        </svg>
      </button>
    </div>
    <div
      class="absolute top-0 bottom-0 z-50 flex h-full text-lg align-middle  -right-8"
    >
      <button class="m-auto group" @click="scrollLeft(true)">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          display="block"
          id="TriangleRight"
          class="fill-[transparent] transition-colors ease-in-out"
          :class="{
            'group-hover:fill-current': !disableRight,
            'text-gray-300': disableRight,
          }"
        >
          <path d="M17 12L9 6v12l8-6z" />
        </svg>
      </button>
    </div>
  </section>
</template>

<script>
  export default {
    props: {
      scrollIncrement: {
        type: Number,
        default: 200,
      },
      seeMoreLink: String,
    },
    data() {
      return {
        slotItems: [],
        disableLeft: true,
        disableRight: false,
      };
    },

    mounted() {
      // Map the width of each element to a widths array
      this.slotItems = this.$slots.default.map((item) => item.elm);
    },

    methods: {
      scrollObserver() {
        const start = this.slotItems[0].getBoundingClientRect();
        const scroller = this.$refs.scrollPane.getBoundingClientRect();
        const end = this.$refs.end.getBoundingClientRect();

        // Detect scroll collision with the start or end of the carousel
        if (Math.ceil(scroller.left) === Math.ceil(start.left)) {
          this.disableLeft = true;
        } else if (end.right - scroller.right <= 2) {
          this.disableRight = true;
        } else {
          this.disableLeft = false;
          this.disableRight = false;
        }
      },
      // Scroll horizontally by an increment
      scrollLeft(isForward = true) {
        const scroller = this.$refs.scrollPane;
        scroller.scrollBy({
          left: isForward ? this.scrollIncrement : -this.scrollIncrement,
          behavior: 'smooth',
        });
      },
    },
  };
</script>
