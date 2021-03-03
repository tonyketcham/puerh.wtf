<template>
  <a
    :href="tag.path"
    :style="`background-color: ${tag.color}; background-opacity: 0.7; min-width: 1.5rem;`"
    class="whitespace-nowrap inline-block p-1 pr-1.5 text-xs font-medium rounded transition-all transform hover:scale-95 drop-shadow hover:opacity-90"
    :class="[isBackgroundDark ? 'text-white' : 'text-gray-800']"
    @mouseover="mouseEnter"
    @mouseleave="mouseLeave"
  >
    <span key="tag" class="w-10 blend-luminosity">
      <span class="opacity-40">#</span>
      {{ tag.title }}
    </span>
  </a>
</template>

<script>
  // import { ZoomCenterTransition } from 'vue2-transitions';
  export default {
    components: {
      // ZoomCenterTransition,
    },
    props: {
      tag: {
        type: Object,
        default: function () {
          return {
            title: 'Tag',
            path: '/tags/gushu',
            color: '#ffffff',
          };
        },
      },
    },
    computed: {
      isBackgroundDark() {
        return this.isColorDark(...this.hex2RGB(this.tag.color));
      },
    },
    data() {
      return {
        hover: false,
        expand: false,
      };
    },
    methods: {
      /**
       * perceptive luminance
       * @see https://codepen.io/WebSeed/full/pvgqEq/
       */
      isColorDark(r, g, b) {
        let a = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return a > 0.5;
      },
      /**
       * @see https://gist.github.com/comficker/871d378c535854c1c460f7867a191a5a#file-hex2rgb-js
       */
      hex2RGB(hex) {
        const RGB_HEX = /^#?(?:([\da-f]{3})[\da-f]?|([\da-f]{6})(?:[\da-f]{2})?)$/i;
        const [, short, long] = String(hex).match(RGB_HEX) || [];

        if (long) {
          const value = Number.parseInt(long, 16);
          return [value >> 16, (value >> 8) & 0xff, value & 0xff];
        } else if (short) {
          return Array.from(short, (s) => Number.parseInt(s, 16)).map(
            (n) => (n << 4) | n
          );
        }
      },
      mouseEnter() {
        this.hover = true;
        setTimeout(() => {
          if (this.hover) this.expand = true;
        }, 50);
      },
      mouseLeave() {
        this.hover = false;
        setTimeout(() => {
          if (!this.hover) this.expand = false;
        }, 10);
      },
    },
  };
</script>

<style lang="css" scoped>
  .blend-luminosity {
    mix-blend-mode: luminosity;
  }
</style>
