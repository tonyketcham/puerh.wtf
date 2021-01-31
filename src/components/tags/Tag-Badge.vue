<template>
  <span
    class="px-1.5 text-xs font-medium rounded-md text-black"
    :class="{ 'text-white': isBackgroundDark }"
    :style="`background-color: ${tag.color}`"
  >
    {{ tag.title }}
  </span>
</template>

<script>
  export default {
    props: {
      tag: {
        type: Object,
        default: function () {
          return {
            title: 'Tag',
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
        console.group('tag');
        console.log(this.tag.title);
        console.log(a);
        console.groupEnd('tag');
        return a > 0.5;
      },
      /**
       * @see https://gist.github.com/comficker/871d378c535854c1c460f7867a191a5a#file-hex2rgb-js
       */
      hex2RGB(hex) {
        console.log(hex);
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
    },
  };
</script>
