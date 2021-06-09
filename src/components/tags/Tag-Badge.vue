<template>
  <a
    :href="tag.path"
    :style="`background-color: ${tag.color}; background-opacity: 0.7`"
    class="
      whitespace-nowrap
      inline-block
      p-1
      pr-1.5
      text-xs
      font-medium
      rounded-lg
      transition-all
      transform
      hover:scale-95
      hover:rotate-1
      shadow-sm
      hover:opacity-90
    "
    :class="[isBackgroundDark ? 'text-white' : 'text-gray-800']"
  >
    <span class="blend-luminosity">
      <span class="opacity-40">#</span>
      {{ tag.title }}
    </span>
  </a>
</template>

<script>
  export default {
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
          return Array.from(short, (s) => Number.parseInt(s, 16)).map((n) => (n << 4) | n);
        }
      },
    },
  };
</script>

<style lang="css" scoped>
  .blend-luminosity {
    mix-blend-mode: luminosity;
  }
</style>
