<template>
  <div class="dashboard">
    <Logo :intensity="2" class="!text-lg lg:!text-2xl brand" />

    <div class="space-x-2 place-items-start site-menu">
      <button v-if="isMenuOpen || !isMobile" class="text-xl">🔎</button>
      <button v-if="isMenuOpen || !isMobile" class="text-xl">⚙️</button>
      <button
        v-if="isMobile"
        @click="isMenuOpen = !isMenuOpen"
        class="w-8 h-8 text-xl transition-transform"
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
      :class="{ 'bg-black px-2': isMobile }"
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
