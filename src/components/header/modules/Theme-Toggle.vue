<template>
  <button
    @click="toggleTheme"
    aria-label="Switch between light and dark mode"
    class="text-amber-400 dark:text-yellow-300 focus:outline-none"
  >
    <Zoom-Center-Transition group class="flex">
      <svg
        key="light"
        v-if="theme === 'light'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-6 h-6"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg
        key="dark"
        v-else
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-6 h-6 hover:stroke-width"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </Zoom-Center-Transition>
  </button>
</template>

<script>
  import { ZoomCenterTransition } from 'vue2-transitions';
  import { mapGetters } from 'vuex';

  export default {
    components: {
      ZoomCenterTransition,
    },
    beforeMount() {
      this.$store.dispatch('initTheme');
    },
    computed: {
      ...mapGetters({ theme: 'getTheme' }),
    },
    watch: {
      theme(newTheme) {
        newTheme === 'light'
          ? document.querySelector('html').classList.remove('dark')
          : document.querySelector('html').classList.add('dark');
      },
    },
    methods: {
      toggleTheme() {
        this.$store.dispatch('toggleTheme');
      },
    },
  };
</script>
