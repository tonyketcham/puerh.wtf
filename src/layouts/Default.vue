<template>
  <div class="dashboard">
    <Logo :intensity="2" class="border-b-2 border-black brand" />

    <Navigation class="border-b-2 border-black site-nav" />

    <div
      class="flex justify-end space-x-2 border-b-2 border-black  place-items-start site-menu"
    >
      <button class="text-xl">🔎</button>
      <button class="text-xl">⚙️</button>
    </div>

    <aside class="sidebar">
      <slot name="sidebar">
        <Sidebar />
      </slot>
    </aside>

    <template v-if="layouts.hasOwnProperty(layout)">
      <div
        v-for="area in layouts[layout]"
        :key="area.id"
        class="overflow-auto scrollbar"
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
  import Logo from '@/components/brand/Logo.vue';
  import Navigation from './modules/Navigation.vue';
  import Sidebar from '@/layouts/modules/Sidebar.vue';
  import SocialLinks from '@/components/profile/Social-Links.vue';

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
      };
    },
  };
</script>

<style lang="scss" scoped>
  // Grid Layout
  .dashboard {
    display: grid;
    grid-template-columns: 0.5fr 2fr 1.5fr;
    grid-template-rows: 0.5fr 2fr repeat(3, 1fr);
    column-gap: 4rem;
    row-gap: 4rem;
    @apply h-screen p-16 gap-16;
  }

  // Header
  .brand {
    grid-area: 1 / 1 / 2 / 2;
  }
  .site-nav {
    grid-area: 1 / 2 / 2 / 3;
  }
  .site-menu {
    grid-area: 1 / 3 / 2 / 4;
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

  .scrollbar::-webkit-scrollbar {
    @apply bg-transparent;
  }
  .scrollbar::-webkit-scrollbar-thumb {
    @apply bg-primary-dark rounded-lg bg-opacity-30 bg-clip-content;
    border: 4px solid transparent;
  }
  .scrollbar:hover::-webkit-scrollbar-thumb {
    @apply bg-opacity-100;
  }
</style>
