<template>
  <div class="dashboard">
    <Logo :intensity="2" class="!text-lg 2xl:!text-2xl brand" />

    <div class="space-x-2 place-items-start site-menu">
      <button v-if="isMenuOpen || !isMobile" class="p-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          display="block"
          id="Search"
        >
          <path
            d="M21 21l-4.486-4.494M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z"
          />
        </svg>
      </button>
      <button v-if="isMenuOpen || !isMobile" class="p-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          display="block"
          id="Gear"
        >
          <path
            d="M14 3.269C14 2.568 13.432 2 12.731 2H11.27C10.568 2 10 2.568 10 3.269v0c0 .578-.396 1.074-.935 1.286-.085.034-.17.07-.253.106-.531.23-1.162.16-1.572-.249v0a1.269 1.269 0 0 0-1.794 0L4.412 5.446a1.269 1.269 0 0 0 0 1.794v0c.41.41.48 1.04.248 1.572a7.946 7.946 0 0 0-.105.253c-.212.539-.708.935-1.286.935v0C2.568 10 2 10.568 2 11.269v1.462C2 13.432 2.568 14 3.269 14v0c.578 0 1.074.396 1.286.935.034.085.07.17.105.253.231.531.161 1.162-.248 1.572v0a1.269 1.269 0 0 0 0 1.794l1.034 1.034a1.269 1.269 0 0 0 1.794 0v0c.41-.41 1.04-.48 1.572-.249.083.037.168.072.253.106.539.212.935.708.935 1.286v0c0 .701.568 1.269 1.269 1.269h1.462c.701 0 1.269-.568 1.269-1.269v0c0-.578.396-1.074.935-1.287.085-.033.17-.068.253-.104.531-.232 1.162-.161 1.571.248v0a1.269 1.269 0 0 0 1.795 0l1.034-1.034a1.269 1.269 0 0 0 0-1.794v0c-.41-.41-.48-1.04-.249-1.572.037-.083.072-.168.106-.253.212-.539.708-.935 1.286-.935v0c.701 0 1.269-.568 1.269-1.269V11.27c0-.701-.568-1.269-1.269-1.269v0c-.578 0-1.074-.396-1.287-.935a7.755 7.755 0 0 0-.105-.253c-.23-.531-.16-1.162.249-1.572v0a1.269 1.269 0 0 0 0-1.794l-1.034-1.034a1.269 1.269 0 0 0-1.794 0v0c-.41.41-1.04.48-1.572.249a7.913 7.913 0 0 0-.253-.106C14.396 4.343 14 3.847 14 3.27v0z"
          />
          <path d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
        </svg>
      </button>
      <button
        v-if="isMobile"
        @click="isMenuOpen = !isMenuOpen"
        class="w-8 h-8 transition-transform"
        :class="[isMenuOpen ? '-rotate-45' : 'rotate-45']"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          display="block"
          id="ThreeLineVertical"
        >
          <path d="M12 19V5m6 14V5M6 19V5" />
        </svg>
      </button>
    </div>

    <Navigation
      v-if="isMenuOpen || !isMobile"
      class="site-nav"
      :forceDarkMode="isMobile"
    />

    <aside class="sidebar">
      <slot name="sidebar">
        <Sidebar v-if="isMenuOpen || !isMobile" />
      </slot>
      <hr class="block w-full h-0.5 mt-8 bg-black lg:hidden" />
    </aside>

    <template v-if="layouts.hasOwnProperty(layout)">
      <div
        v-for="area in layouts[layout]"
        :key="area.id"
        class="scrollbar"
        :class="`${area.id}-${area.mode}`"
      >
        <slot :name="`${area.id}-block`" />
      </div>
    </template>

    <template v-else>
      <h1 class="text-3xl text-red-500 primary-block">
        📢 ERROR: you've selected a layout which does not exist 🧇
      </h1>
    </template>

    <footer class="border-t-2 border-black footer">
      <div class="mt-8 space-y-4">
        <h2 class="text-lg font-black tracking-tight">puerh, wtf?</h2>
        <SocialLinks
          :links="{
            github: 'tonyketcham',
            instagram: 'puerh.wtf',
            website: 'https://karmalies.studio',
          }"
        />
        <p class="text-xs italic text-gray-500">Tryin to figure out tea</p>
      </div>
    </footer>
  </div>
</template>

<script>
  // Components
  import Logo from '@/components/brand/Logo.vue';
  import Navigation from './modules/Navigation.vue';
  import Sidebar from '@/layouts/modules/Sidebar.vue';
  import SocialLinks from '@/components/profile/Social-Links.vue';

  // Watch window size mixin
  import { vueWindowSizeMixin } from 'vue-window-size';

  export default {
    props: {
      layout: {
        type: String,
        default: 'quarters',
      },
    },
    components: {
      Logo,
      Navigation,
      Sidebar,
      SocialLinks,
    },
    data() {
      return {
        layouts: {
          quarters: [
            {
              id: 'primary',
              mode: 'block',
            },
            {
              id: 'secondary',
              mode: 'block',
            },
            {
              id: 'tertiary',
              mode: 'block',
            },
            {
              id: 'quaternary',
              mode: 'block',
            },
          ],
          '2 columns': [
            {
              id: 'primary',
              mode: 'column',
            },
            {
              id: 'secondary',
              mode: 'column',
            },
          ],
        },
        isMenuOpen: false,
      };
    },
    computed: {
      isMobile() {
        return this.windowWidth < 1024;
      },
    },
    mixins: [vueWindowSizeMixin],
  };
</script>

<style lang="scss">
  html {
    @apply selection:bg-yellow-400 selection:text-black selection:rounded-md selection:text-shadow-sm;
    @apply bg-primary-light;
  }
  .dashboard {
    @apply h-screen px-8 space-y-8;
  }

  // Header
  .brand {
    @apply w-1/2;
  }
  .site-menu {
    @apply inline-flex justify-end w-1/2;
  }
  .site-nav {
  }

  @screen lg {
    // Grid Layout
    .dashboard {
      display: grid;
      grid-template-columns: 0.5fr 2fr 1.5fr;
      grid-template-rows: 0.5fr 2fr repeat(3, 1fr);
      column-gap: 4rem;
      row-gap: 4rem;
      @apply p-16 pb-12 gap-16 space-y-0;
    }

    // Header
    .brand {
      @apply w-auto;
      @apply border-b-2 border-black;
      grid-area: 1 / 1 / 2 / 2;
    }
    .site-menu {
      @apply w-auto;

      @apply border-b-2 border-black;
      grid-area: 1 / 3 / 2 / 4;
    }
    .site-nav {
      @apply border-b-2 border-black;
      grid-area: 1 / 2 / 2 / 3;
    }

    // Sidebar
    .sidebar {
      grid-area: 2 / 1 / 5 / 2;
    }

    // Blocks
    .primary-block {
      grid-area: 2 / 2 / 4 / 3;
    }
    .secondary-block {
      grid-area: 2 / 3 / 4 / 4;
    }
    .tertiary-block {
      grid-area: 4 / 2 / 6 / 3;
    }
    .quaternary-block {
      grid-area: 4 / 3 / 6 / 4;
    }

    // Columns
    .primary-column {
      grid-area: 2 / 2 / 6 / 3;
    }
    .secondary-column {
      grid-area: 2 / 3 / 6 / 4;
    }

    // Footer
    .footer {
      grid-area: 5 / 1 / 6 / 2;
    }
  }

  .no-scrollbar::-webkit-scrollbar {
    @apply hidden;
  }

  @screen lg {
    // Scrollbar
    ::-webkit-scrollbar {
      @apply bg-transparent;
    }
    ::-webkit-scrollbar-thumb {
      @apply bg-primary-dark rounded-lg bg-opacity-10 bg-clip-content;
      border: 4px solid transparent;
    }
    ::-webkit-scrollbar-thumb:hover {
      @apply bg-opacity-100;
    }
    .scrollbar::-webkit-scrollbar {
      @apply bg-transparent;
    }
    .scrollbar::-webkit-scrollbar-thumb {
      @apply bg-primary-dark rounded-lg bg-opacity-10 bg-clip-content;
      border: 4px solid transparent;
    }
    .scrollbar:hover::-webkit-scrollbar-thumb {
      @apply bg-opacity-100;
    }
  }
</style>
